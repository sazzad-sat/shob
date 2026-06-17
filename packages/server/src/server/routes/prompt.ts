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
  const requestID = `${sessionID}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const system = [
    [
      "You are an expert prompt engineer that rewrites user prompts before they are sent to a coding agent.",
      "Your goal is to make the prompt SIGNIFICANTLY more effective so the coding agent produces the correct result on the first attempt.",
    ].join(" "),
    [
      "IMPROVEMENTS TO MAKE:",
      "1. Disambiguate vague language — replace unclear words like 'fix it', 'make it work', 'improve this' with precise technical descriptions of what should change.",
      "2. Add explicit acceptance criteria when the user's intent implies them but doesn't state them.",
      "3. Specify edge cases, error handling, and expected behavior that the user likely wants but didn't mention.",
      "4. Structure multi-step requests into clear numbered steps.",
      "5. Clarify the scope — if the user references files, functions, or components, make the references unambiguous.",
      "6. Add relevant technical context that would help the coding agent (e.g., 'this is a React component' or 'this uses TypeScript').",
      "7. If the prompt is already well-written, still look for opportunities to add clarity, precision, or structure.",
    ].join(" "),
    [
      "RULES:",
      "1. PRESERVE the user's exact intent — never change what they want done, only how clearly they ask for it.",
      "2. PRESERVE all filenames, paths, @mentions, commands, code snippets, and quoted text exactly as written.",
      "3. Do NOT add requirements the user didn't imply. Do NOT remove requirements.",
      "4. Do NOT answer the prompt or write code. Do NOT add greetings or meta-commentary.",
      "5. Return ONLY the improved prompt text, nothing else.",
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
        "Significantly improve the following prompt for a coding agent.",
        "Make it more precise, unambiguous, and actionable.",
        "Add structure, acceptance criteria, and technical clarity where appropriate.",
        "Preserve the exact intent, all file references, @mentions, and code snippets.",
        "",
        "<prompt>",
        input.prompt,
        "</prompt>",
      ].join("\n"),
    },
  ]
  const maxOutputTokens = Math.min(
    ProviderTransform.maxOutputTokens(model),
    Math.max(2048, Math.ceil(input.prompt.length / 2) + 1024),
  )
  const result = await generateText({
    temperature: model.capabilities.temperature ? 0.2 : undefined,
    topP: ProviderTransform.topP(model),
    topK: ProviderTransform.topK(model),
    maxOutputTokens,
    providerOptions,
    headers: {
      ...(model.providerID.startsWith("shob")
        ? {
            "x-shob-project": Instance.project.id,
            "x-shob-session": sessionID,
            "x-shob-request": requestID,
            "x-shob-client": Flag.SHOB_CLIENT,
          }
        : {
            "x-session-affinity": sessionID,
            "User-Agent": `shob/${Installation.VERSION}`,
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
