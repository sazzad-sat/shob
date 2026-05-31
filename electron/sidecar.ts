type StartCommand = {
  type: "start"
  hostname: string
  port: number
  password: string
  serverModulePath: string
}

type StopCommand = { type: "stop" }
type SidecarCommand = StartCommand | StopCommand

type ParentPort = {
  postMessage(message: unknown): void
  on(event: "message", listener: (event: { data: unknown }) => void): void
}

type SidecarMessage =
  | { type: "ready"; hostname: string; port: number }
  | { type: "stopped" }
  | { type: "error"; error: { message: string; stack?: string } }

function getParentPort(): ParentPort {
  const port = (process as unknown as { parentPort?: ParentPort }).parentPort
  if (!port) throw new Error("Sidecar parent port unavailable")
  return port
}

const parentPort = getParentPort()

function post(message: SidecarMessage) {
  parentPort.postMessage(message)
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  return { message: String(error) }
}

async function start(command: StartCommand) {
  try {
    Object.assign(process.env, {
      OPENCODE_SERVER_USERNAME: "opencode",
      OPENCODE_SERVER_PASSWORD: command.password,
      OPENCODE_DISABLE_EMBEDDED_WEB_UI: "true",
    })

    const serverModule = await import(command.serverModulePath)
    const { Server, Log } = serverModule

    await Log.init({ level: "WARN" })

    const listener = await Server.listen({
      port: command.port,
      hostname: command.hostname,
    })

    post({ type: "ready", hostname: command.hostname, port: listener.port })

    parentPort.on("message", (event: { data: unknown }) => {
      const msg = event.data as StopCommand | undefined
      if (msg?.type === "stop") {
        listener
          .stop(true)
          .then(() => {
            post({ type: "stopped" })
            process.exit(0)
          })
          .catch(() => process.exit(0))
      }
    })
  } catch (error) {
    post({ type: "error", error: serializeError(error) })
    process.exit(1)
  }
}

parentPort.on("message", (event: { data: unknown }) => {
  const command = event.data as SidecarCommand | undefined
  if (!command) return
  if (command.type === "stop") {
    post({ type: "stopped" })
    process.exit(0)
  }
  if (command.type === "start") {
    void start(command)
  }
})
