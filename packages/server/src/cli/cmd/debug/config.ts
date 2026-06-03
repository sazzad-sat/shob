import { EOL } from "os"
import { cmd } from "../cmd"

export const ConfigCommand = cmd({
  command: "config",
  describe: "show resolved configuration",
  builder: (yargs) => yargs,
  async handler() {
    const [{ bootstrap }, { Config }] = await Promise.all([import("../../bootstrap"), import("../../../config/config")])
    await bootstrap(process.cwd(), async () => {
      const config = await Config.get()
      process.stdout.write(JSON.stringify(config, null, 2) + EOL)
    })
  },
})
