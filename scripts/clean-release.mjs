import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const releaseDir = path.join(rootDir, "release")

await fs.rm(releaseDir, { recursive: true, force: true })
console.log(`[clean-release] removed ${releaseDir}`)
