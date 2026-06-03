import { EOL } from "os"
import { cmd } from "../cmd"

export const SkillCommand = cmd({
  command: "skill",
  describe: "list all available skills",
  builder: (yargs) => yargs,
  async handler() {
    const [{ bootstrap }, { Skill }] = await Promise.all([import("../../bootstrap"), import("../../../skill")])
    await bootstrap(process.cwd(), async () => {
      const skills = await Skill.all()
      process.stdout.write(JSON.stringify(skills, null, 2) + EOL)
    })
  },
})
