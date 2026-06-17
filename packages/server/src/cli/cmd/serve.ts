import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "../../flag/flag"

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless shob server",
  handler: async (args) => {
    const { Server } = await import("../../server/server")
    if (!Flag.SHOB_SERVER_PASSWORD) {
      console.log("Warning: SHOB_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = await resolveNetworkOptions(args)
    const server = await Server.listen(opts)
    console.log(`shob server listening on http://${server.hostname}:${server.port}`)

    await new Promise(() => { })
    await server.stop()
  },
})
