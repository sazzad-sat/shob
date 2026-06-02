type BaseModel = {
  id: string
  name: string
  reasoning: boolean
}

type BaseProvider = {
  id: string
  name: string
  env: string[]
  models: Record<string, BaseModel>
}

export function withQoderModels<TProvider extends BaseProvider & Record<string, any>>(result: Record<string, TProvider>) {
  const google = result.google
  if (!google) return result

  const fallback = google.models["gemini-3.1-pro-preview"] ?? Object.values(google.models).at(0)
  if (!fallback) return result

  const make = (id: string, name: string, opts?: { reasoning?: boolean; attachment?: boolean }): TProvider["models"][string] => {
    const seed = fallback
    return {
      ...seed,
      id,
      name,
      release_date: "2026-06-02",
      attachment: opts?.attachment ?? false,
      reasoning: opts?.reasoning ?? false,
      temperature: true,
      tool_call: true,
      limit: {
        context: 131072,
        output: 4096,
      },
      provider: {
        npm: "@ai-sdk/openai-compatible",
        api: "https://api3.qoder.sh/algo",
      },
    } as unknown as TProvider["models"][string]
  }

  const models: TProvider["models"] = {
    auto: make("auto", "Qoder Auto", { reasoning: true, attachment: true }),
    ultimate: make("ultimate", "Qoder Ultimate", { reasoning: true, attachment: true }),
    performance: make("performance", "Qoder Performance", { attachment: true }),
    efficient: make("efficient", "Qoder Efficient"),
    lite: make("lite", "Qoder Lite"),
    qmodel: make("qmodel", "Qwen 3.6-Plus", { reasoning: true }),
    dmodel: make("dmodel", "DeepSeek-V4-Pro", { reasoning: true }),
    dfmodel: make("dfmodel", "DeepSeek-V4-Flash", { reasoning: true }),
    gm51model: make("gm51model", "GLM-5.1"),
    kmodel: make("kmodel", "Kimi-K2.6"),
    mmodel: make("mmodel", "MiniMax-M2.7"),
  }

  return {
    ...result,
    qoder: {
      id: "qoder",
      name: "Qoder",
      env: [],
      models,
    } as unknown as TProvider,
  }
}
