import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import net from "node:net"
import fs from "node:fs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, "..")
const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
const defaultPackagedServerEntry = path.resolve(
  resourcesPath ?? path.resolve(projectRoot, ".."),
  "dist-server",
  process.platform === "win32" ? "server.exe" : "server",
)

const START_TIMEOUT_MS = 120000
const HEALTH_POLL_INTERVAL_MS = 100
const HEALTH_TIMEOUT_MS = 30000
const HEALTH_FETCH_TIMEOUT_MS = 3000

type StartServerOptions = {
  packaged?: boolean
  serverEntry?: string
}

export interface ServerInstance {
  url: string
  port: number
  hostname: string
  stop: () => Promise<void>
}

function getServerEntry(packaged: boolean, override?: string): string {
  if (override) return override
  if (packaged) return defaultPackagedServerEntry
  return path.resolve(projectRoot, "packages", "server", "src", "index.ts")
}

function resolveBun(): string {
  const candidates = process.platform === "win32"
    ? ["bun.exe", "bun.cmd", "bun"]
    : ["bun"]

  if (process.env.PATH) {
    for (const dir of process.env.PATH.split(path.delimiter)) {
      for (const name of candidates) {
        const candidate = path.join(dir, name)
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate
          }
        } catch {
          // Ignore inaccessible PATH entries and keep scanning.
        }
      }
    }
  }

  return "bun"
}

async function findFreePort(hostname: string = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, hostname, () => {
      const addr = server.address()
      if (!addr || typeof addr === "string") {
        server.close()
        reject(new Error("Failed to get port from server address"))
        return
      }
      const port = addr.port
      server.close(() => resolve(port))
    })
  })
}

async function waitForHealth(url: string, timeoutMs = HEALTH_TIMEOUT_MS): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), HEALTH_FETCH_TIMEOUT_MS)
      const res = await fetch(`${url}/global/health`, { signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) return
    } catch {
      // Retry until the sidecar is healthy or the startup timeout expires.
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS))
  }
  throw new Error(`Server health check timed out after ${timeoutMs}ms`)
}

export async function startServer(options: StartServerOptions = {}): Promise<ServerInstance> {
  const hostname = "127.0.0.1"
  const port = await findFreePort(hostname)
  const packaged = options.packaged ?? projectRoot.endsWith("app.asar")
  const serverEntry = getServerEntry(packaged, options.serverEntry)
  let proc;
  if (packaged) {
    if (!fs.existsSync(serverEntry)) {
      throw new Error(`Packaged server executable was not found at ${serverEntry}`)
    }

    console.log(`[shob] starting packaged server on ${hostname}:${port} at ${serverEntry}`)
    proc = spawn(serverEntry, [
      "serve",
      `--hostname=${hostname}`,
      `--port=${port}`,
    ], {
      cwd: path.dirname(serverEntry),
      env: {
        ...process.env,
        OPENCODE_DISABLE_EMBEDDED_WEB_UI: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
  } else {
    const bunPath = resolveBun()
    console.log(`[shob] starting server on ${hostname}:${port} with ${bunPath}`)

    proc = spawn(bunPath, [
      "--conditions=browser",
      serverEntry,
      "serve",
      `--hostname=${hostname}`,
      `--port=${port}`,
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        OPENCODE_DISABLE_EMBEDDED_WEB_UI: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
  }

  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error(`Server start timed out after ${START_TIMEOUT_MS}ms`))
    }, START_TIMEOUT_MS)

    let output = ""
    let resolved = false

    proc.stdout?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk)
      if (resolved) return
      output += chunk.toString()
      const match = output.match(/opencode server listening on (https?:\/\/[^\s]+)/)
      if (match && match[1]) {
        resolved = true
        clearTimeout(timeout)
        resolve(match[1])
      }
    })

    proc.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk)
      output += chunk.toString()
    })

    proc.on("exit", (code) => {
      clearTimeout(timeout)
      if (!resolved) {
        reject(new Error(`Server exited with code ${code}. Output:\n${output}`))
      }
    })

    proc.on("error", (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  console.log(`[shob] server listening at ${url}`)

  try {
    await waitForHealth(url)
    console.log(`[shob] server health check passed`)
  } catch (err) {
    proc.kill()
    throw err
  }

  return {
    url,
    port,
    hostname,
    stop: async () => {
      return new Promise<void>((resolve) => {
        if (proc.exitCode !== null || proc.killed) {
          resolve()
          return
        }
        const onExit = () => {
          proc.off("exit", onExit)
          resolve()
        }
        proc.on("exit", onExit)
        const killed = proc.kill("SIGTERM")
        if (!killed) {
          proc.off("exit", onExit)
          resolve()
          return
        }
        setTimeout(() => {
          if (proc.exitCode === null && !proc.killed) {
            proc.kill("SIGKILL")
          }
          resolve()
        }, 5000)
      })
    },
  }
}
