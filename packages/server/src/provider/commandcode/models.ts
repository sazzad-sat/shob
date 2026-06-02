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

export function withCommandCodeModels<TProvider extends BaseProvider & Record<string, any>>(result: Record<string, TProvider>) {
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
        api: "https://api.commandcode.ai/alpha/generate",
      },
    } as unknown as TProvider["models"][string]
  }

  const models: TProvider["models"] = {
    "deepseek/deepseek-v4-pro": make("deepseek/deepseek-v4-pro", "DeepSeek V4 Pro", { reasoning: true }),
    "deepseek/deepseek-v4-flash": make("deepseek/deepseek-v4-flash", "DeepSeek V4 Flash", { reasoning: true }),
    "moonshotai/Kimi-K2.6": make("moonshotai/Kimi-K2.6", "Kimi K2.6"),
    "moonshotai/Kimi-K2.5": make("moonshotai/Kimi-K2.5", "Kimi K2.5"),
    "zai-org/GLM-5.1": make("zai-org/GLM-5.1", "GLM 5.1"),
    "zai-org/GLM-5": make("zai-org/GLM-5", "GLM 5"),
    "MiniMaxAI/MiniMax-M2.7": make("MiniMaxAI/MiniMax-M2.7", "MiniMax M2.7"),
    "MiniMaxAI/MiniMax-M2.5": make("MiniMaxAI/MiniMax-M2.5", "MiniMax M2.5"),
    "Qwen/Qwen3.6-Max-Preview": make("Qwen/Qwen3.6-Max-Preview", "Qwen 3.6 Max Preview"),
    "Qwen/Qwen3.6-Plus": make("Qwen/Qwen3.6-Plus", "Qwen 3.6 Plus"),
    "stepfun/Step-3.5-Flash": make("stepfun/Step-3.5-Flash", "Step 3.5 Flash"),
  }

  return {
    ...result,
    commandcode: {
      id: "commandcode",
      name: "Command Code",
      env: [],
      models,
    } as unknown as TProvider,
  }
}
