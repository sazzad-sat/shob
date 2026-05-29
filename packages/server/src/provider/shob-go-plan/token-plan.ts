const KEY_SOURCE_URL = "https://raw.githubusercontent.com/SeraProgrammer-org/info/main/run.text"
const TOKEN_PATTERN = /\btp-[a-z0-9]+\b/gi
const RETRYABLE_TOKEN_STATUS = new Set([401, 403, 429])

let cachedKeys: string[] = []

function parseKeys(text: string) {
  return Array.from(new Set(text.match(TOKEN_PATTERN) ?? []))
}

function randomIndex(max: number) {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] % max
}

function randomOrder<T>(items: T[]) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    const current = result[i]
    result[i] = result[j]
    result[j] = current
  }
  return result
}

async function loadKeys(signal?: AbortSignal) {
  try {
    const response = await fetch(KEY_SOURCE_URL, {
      headers: {
        Accept: "text/plain",
        "User-Agent": "shob-go-plan",
      },
      signal,
    })
    if (!response.ok) throw new Error(`Failed to load Shob Go plan keys (${response.status})`)

    const keys = parseKeys(await response.text())
    if (keys.length === 0) throw new Error("No Shob Go plan keys found")

    cachedKeys = keys
    return keys
  } catch (error) {
    if (cachedKeys.length > 0) return cachedKeys
    throw error
  }
}

export async function shobGoPlanFetch(input: RequestInfo | URL, init?: RequestInit) {
  const keys = randomOrder(await loadKeys(init?.signal ?? undefined))
  let fallback: Response | undefined

  for (const key of keys) {
    const headers = new Headers(init?.headers)
    headers.set("Authorization", `Bearer ${key}`)
    headers.set("x-api-key", key)

    const response = await fetch(input, {
      ...init,
      headers,
    })

    if (!(await shouldTryAnotherKey(response.clone()))) return response
    fallback = response
  }

  return fallback!
}

async function shouldTryAnotherKey(response: Response) {
  if (!RETRYABLE_TOKEN_STATUS.has(response.status)) return false
  if (response.status === 429) return true

  const text = await response.text().catch(() => "")
  return /quota|limit|exhaust|invalid|expired|unauthorized|forbidden/i.test(text)
}
