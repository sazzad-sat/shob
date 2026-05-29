type BaseModel = {
  id: string
  name: string
  family?: string
  release_date: string
  attachment: boolean
  reasoning: boolean
  temperature: boolean
  tool_call: boolean
  interleaved?: true | { field: "reasoning_content" | "reasoning_details" }
  cost?: {
    input: number
    output: number
    cache_read?: number
    cache_write?: number
  }
  limit: {
    context: number
    input?: number
    output: number
  }
  modalities?: {
    input: Array<"text" | "audio" | "image" | "video" | "pdf">
    output: Array<"text" | "audio" | "image" | "video" | "pdf">
  }
}

type BaseProvider = {
  id: string
  name: string
  env: string[]
  api?: string
  npm?: string
  models: Record<string, BaseModel>
}

export const SHOB_GO_PLAN_PROVIDER_ID = "shob-go-plan"
export const SHOB_GO_PLAN_MODEL_ID = "mimo-v2.5-pro"
export const SHOB_GO_PLAN_BASE_URL = "https://token-plan-sgp.xiaomimimo.com/v1"

function model(seed?: BaseModel): BaseModel {
  return {
    ...seed,
    id: SHOB_GO_PLAN_MODEL_ID,
    name: "MiMo-V2.5-Pro",
    family: seed?.family ?? "mimo",
    release_date: seed?.release_date ?? "2026-05-29",
    attachment: seed?.attachment ?? true,
    reasoning: seed?.reasoning ?? true,
    temperature: seed?.temperature ?? true,
    tool_call: seed?.tool_call ?? true,
    interleaved: seed?.interleaved ?? { field: "reasoning_content" },
    cost: seed?.cost ?? {
      input: 1,
      output: 3,
      cache_read: 0.2,
    },
    limit: seed?.limit ?? {
      context: 1_000_000,
      output: 128_000,
    },
    modalities: seed?.modalities ?? {
      input: ["text"],
      output: ["text"],
    },
  }
}

export function withShobGoPlanModels<TProvider extends BaseProvider & Record<string, any>>(
  result: Record<string, TProvider>,
): Record<string, TProvider> {
  const xiaomi = result.xiaomi
  const seed =
    xiaomi?.models["mimo-v2-pro"] ?? Object.values(xiaomi?.models ?? {}).find((item) => item.id.includes("mimo"))

  return {
    ...result,
    [SHOB_GO_PLAN_PROVIDER_ID]: {
      ...(xiaomi ?? {}),
      id: SHOB_GO_PLAN_PROVIDER_ID,
      name: "Shob Go plan",
      env: [],
      api: SHOB_GO_PLAN_BASE_URL,
      npm: "@ai-sdk/openai-compatible",
      models: {
        [SHOB_GO_PLAN_MODEL_ID]: model(seed),
      },
    } as TProvider,
  } as Record<string, TProvider>
}
