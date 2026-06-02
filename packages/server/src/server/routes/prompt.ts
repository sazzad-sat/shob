import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { generateText, type ModelMessage } from "ai"
import { mergeDeep, pipe } from "remeda"
import z from "zod"
import { Auth } from "../../auth"
import { Installation } from "../../installation"
import { Flag } from "../../flag/flag"
import { Instance } from "../../project/instance"
import { ModelID, ProviderID } from "../../provider/schema"
import { Provider } from "../../provider/provider"
import { ProviderTransform } from "../../provider/transform"
import { lazy } from "../../util/lazy"
import { errors } from "../error"

const PromptImproveBody = z.object({
  prompt: z.string().min(1),
  model: z.object({
    providerID: ProviderID.zod,
    modelID: ModelID.zod,
  }),
  variant: z.string().optional(),
})

const PromptImproveResult = z.object({
  prompt: z.string(),
})

async function improvePrompt(input: z.infer<typeof PromptImproveBody>) {
  const model = await Provider.getModel(input.model.providerID, input.model.modelID)
  const provider = await Provider.getProvider(model.providerID)
  const language = await Provider.getLanguage(model)
  const auth = await Auth.get(model.providerID)
  const sessionID = "prompt-improve"
  const system = [
    [
      "You improve user prompts before they are sent to a coding agent.",
      "Rewrite the prompt for clearer grammar, wording, and structure.",
      "Preserve the user's exact intent, constraints, facts, filenames, paths, @mentions, commands, code, and requested scope.",
      "Do not add new requirements, remove requirements, answer the prompt, or change the user's context.",
      "Return only the improved prompt text.",
    ].join(" "),
  ]
  const isOpenaiOauth = provider.id === "openai" && auth?.type === "oauth"
  const variant = input.variant && model.variants?.[input.variant] ? model.variants[input.variant] : {}
  const options = pipe(ProviderTransform.options({ model, sessionID }), mergeDeep(model.options), mergeDeep(variant))
  const providerOptions = isOpenaiOauth
    ? ProviderTransform.providerOptions(model, mergeDeep(options, { instructions: system.join("\n"), store: false }))
    : ProviderTransform.providerOptions(model, options)
  const messages: ModelMessage[] = [
    ...(isOpenaiOauth
      ? []
      : system.map((content): ModelMessage => ({
          role: "system",
          content,
        }))),
    {
      role: "user",
      content: [
        "Improve this prompt. Keep the same meaning and context:",
        "",
        "<prompt>",
        input.prompt,
        "</prompt>",
      ].join("\n"),
    },
  ]
  const maxOutputTokens = Math.min(
    ProviderTransform.maxOutputTokens(model),
    Math.max(1024, Math.ceil(input.prompt.length / 3) + 512),
  )
  const result = await generateText({
    temperature: model.capabilities.temperature ? 0.2 : undefined,
    topP: ProviderTransform.topP(model),
    topK: ProviderTransform.topK(model),
    maxOutputTokens,
    providerOptions,
    headers: {
      ...(model.providerID.startsWith("opencode")
        ? {
            "x-opencode-project": Instance.project.id,
            "x-opencode-session": sessionID,
            "x-opencode-request": sessionID,
            "x-opencode-client": Flag.OPENCODE_CLIENT,
          }
        : {
            "x-session-affinity": sessionID,
            "User-Agent": `opencode/${Installation.VERSION}`,
          }),
      ...model.headers,
    },
    messages: ProviderTransform.message(messages, model, options),
    model: language,
  })
  const improved = result.text.trim()
  if (!improved) throw new Error("The model returned an empty prompt.")
  return { prompt: improved }
}

export const PromptRoutes = lazy(() =>
  new Hono().post(
    "/improve",
    describeRoute({
      summary: "Improve prompt",
      description: "Rewrite a draft prompt for clarity while preserving the user's original intent and context.",
      operationId: "prompt.improve",
      responses: {
        200: {
          description: "Improved prompt",
          content: {
            "application/json": {
              schema: resolver(PromptImproveResult),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator("json", PromptImproveBody),
    async (c) => {
      const body = c.req.valid("json")
      return c.json(await improvePrompt(body))
    },
  ),
)
