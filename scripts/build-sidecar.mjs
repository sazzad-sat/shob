import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const serverDir = path.join(rootDir, "packages", "server")
const migrationDir = path.join(serverDir, "migration")

function timestampFromName(name) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name)
  if (!match) return 0
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  )
}

async function loadMigrations() {
  const entries = await fs.readdir(migrationDir, { withFileTypes: true })
  const dirs = entries
    .filter((entry) => entry.isDirectory() && /^\d{14}/.test(entry.name))
    .map((entry) => entry.name)
    .sort()

  return Promise.all(
    dirs.map(async (name) => ({
      name,
      timestamp: timestampFromName(name),
      sql: await fs.readFile(path.join(migrationDir, name, "migration.sql"), "utf8"),
    })),
  )
}

const migrations = await loadMigrations()
console.log(`[sidecar] loaded ${migrations.length} migrations`)

const outdir = path.join(rootDir, "dist-server")
await fs.rm(outdir, { recursive: true, force: true })
await fs.mkdir(outdir, { recursive: true })

const result = await Bun.build({
  target: "node",
  entrypoints: [path.join(serverDir, "src", "node.ts")],
  outdir,
  format: "esm",
  sourcemap: "linked",
  external: [
    "@lydell/node-pty",
    "@parcel/watcher",
    "jsonc-parser",
  ],
  define: {
    OPENCODE_MIGRATIONS: JSON.stringify(migrations),
  },
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

console.log(`[sidecar] built server bundle → ${outdir}`)
