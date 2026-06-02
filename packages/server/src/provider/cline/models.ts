import path from "path"
import { Global } from "../../global"
import { Installation } from "../../installation"
import { Filesystem } from "../../util/filesystem"
import type { ModelsDev } from "../models"

const CLINE_MODELS_URL = "https://api.cline.bot/api/v1/ai/cline/models"
const CLINE_API_BASE_URL = "https://api.cline.bot/api/v1"
const CACHE_TTL_MS = 5 * 60 * 1000
const cachePath = path.join(Global.Path.cache, "cline-models.json")

type RawClineModel = {
  id?: string
  name?: string
  created?: number
  context_length?: number | null
  top_provider?: {
    max_completion_tokens?: number | null
    context_length?: number | null
  } | null
  architecture?: {
    modality?: string | string[]
    input_modalities?: string[]
    output_modalities?: string[]
  } | null
  pricing?: {
    prompt?: string | number | null
    completion?: string | number | null
    input_cache_read?: string | number | null
    input_cache_write?: string | number | null
  } | null
  supported_parameters?: string[] | null
}

function fresh() {
  return Date.now() - Number(Filesystem.stat(cachePath)?.mtimeMs ?? 0) < CACHE_TTL_MS
}

function parsePrice(value: unknown) {
  if (value === undefined || value === null || value === "") return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed * 1_000_000 : 0
}

function includesModality(raw: RawClineModel, modality: string, side: "input" | "output") {
  const explicit = side === "input" ? raw.architecture?.input_modalities : raw.architecture?.output_modalities
  if (explicit?.includes(modality)) return true
  const generic = raw.architecture?.modality
  if (Array.isArray(generic)) return generic.includes(modality)
  return typeof generic === "string" && generic.includes(modality)
}

function releaseDate(raw: RawClineModel) {
  if (typeof raw.created === "number" && raw.created > 0) {
    return new Date(raw.created * 1000).toISOString().split("T")[0]
  }
  return new Date().toISOString().split("T")[0]
}

async function readCached() {
  const cached = await Filesystem.readJson(cachePath).catch(() => undefined)
  if (!cached || typeof cached !== "object") return []
  if (Array.isArray(cached)) return cached as RawClineModel[]
  const data = (cached as { data?: unknown }).data
  return Array.isArray(data) ? (data as RawClineModel[]) : []
}

async function fetchClineModels() {
  if (fresh()) {
    const cached = await readCached()
    if (cached.length) return cached
  }

  const response = await fetch(CLINE_MODELS_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": `9Router/${Installation.VERSION}`,
      "HTTP-Referer": "https://cline.bot",
      "X-Title": "Cline",
      "X-CLIENT-TYPE": "9router",
      "X-CLIENT-VERSION": Installation.VERSION,
      "X-CORE-VERSION": Installation.VERSION,
      "X-IS-MULTIROOT": "false",
    },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Cline models fetch failed: ${response.status}`)
  const payload = (await response.json()) as { data?: RawClineModel[] } | RawClineModel[]
  const data = Array.isArray(payload) ? payload : payload.data
  if (!Array.isArray(data)) throw new Error("Invalid Cline models response")
  await Filesystem.write(cachePath, JSON.stringify({ data }, null, 2)).catch(() => {})
  return data
}

function fromRaw(raw: RawClineModel): ModelsDev.Model | undefined {
  if (!raw.id) return
  const params = raw.supported_parameters ?? []
  const context = raw.context_length ?? raw.top_provider?.context_length ?? 4096
  const output = raw.top_provider?.max_completion_tokens ?? 4096
  const inputModalities = {
    text: includesModality(raw, "text", "input") || !raw.architecture,
    audio: includesModality(raw, "audio", "input"),
    image: includesModality(raw, "image", "input"),
    video: includesModality(raw, "video", "input"),
    pdf: includesModality(raw, "pdf", "input"),
  }
  const outputModalities = {
    text: includesModality(raw, "text", "output") || !raw.architecture,
    audio: includesModality(raw, "audio", "output"),
    image: includesModality(raw, "image", "output"),
    video: includesModality(raw, "video", "output"),
    pdf: includesModality(raw, "pdf", "output"),
  }

  return {
    id: raw.id,
    name: raw.name || raw.id,
    release_date: releaseDate(raw),
    attachment: inputModalities.image || inputModalities.pdf,
    reasoning: params.includes("include_reasoning") || params.includes("reasoning"),
    temperature: params.length === 0 || params.includes("temperature"),
    tool_call: params.length === 0 || params.includes("tools"),
    cost: {
      input: parsePrice(raw.pricing?.prompt),
      output: parsePrice(raw.pricing?.completion),
      cache_read: parsePrice(raw.pricing?.input_cache_read),
      cache_write: parsePrice(raw.pricing?.input_cache_write),
    },
    limit: {
      context,
      input: context,
      output,
    },
    modalities: {
      input: Object.entries(inputModalities)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key as "text" | "audio" | "image" | "video" | "pdf"),
      output: Object.entries(outputModalities)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key as "text" | "audio" | "image" | "video" | "pdf"),
    },
    provider: {
      npm: "@ai-sdk/openai-compatible",
      api: CLINE_API_BASE_URL,
    },
  }
}

export async function withClineModels<TProvider extends ModelsDev.Provider & Record<string, any>>(
  result: Record<string, TProvider>,
) {
  let rawModels: RawClineModel[] = []
  try {
    rawModels = await fetchClineModels()
  } catch {
    rawModels = await readCached()
  }

  const models: Record<string, ModelsDev.Model> = {}
  for (const raw of rawModels) {
    const model = fromRaw(raw)
    if (model) models[model.id] = model
  }

  if (Object.keys(models).length === 0) {
    const openrouter = result.openrouter
    if (!openrouter) return result
    for (const [id, model] of Object.entries(openrouter.models)) {
      models[id] = {
        ...model,
        id,
        provider: {
          npm: "@ai-sdk/openai-compatible",
          api: CLINE_API_BASE_URL,
        },
      }
    }
  }

  return {
    ...result,
    cline: {
      id: "cline",
      name: "Cline",
      env: ["CLINE_API_KEY"],
      npm: "@ai-sdk/openai-compatible",
      api: CLINE_API_BASE_URL,
      models,
    } as TProvider,
  }
}
