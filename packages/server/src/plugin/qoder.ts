import type { Hooks, PluginInput } from "@shob-ai/plugin"
import { randomBytes, createHash, publicEncrypt, constants, createCipheriv } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { OAUTH_DUMMY_KEY } from "../auth"
import { Log } from "../util/log"

const log = Log.create({ service: "plugin.qoder" })

// Qoder API constants
const QODER_OPENAPI_BASE = "https://openapi.qoder.sh"
const QODER_CHAT_BASE = "https://api3.qoder.sh"
const QODER_LOGIN_URL = "https://qoder.com/device/selectAccounts"

const QODER_DEVICE_TOKEN_URL = `${QODER_OPENAPI_BASE}/api/v1/deviceToken/poll`
const QODER_USERINFO_URL = `${QODER_OPENAPI_BASE}/api/v1/userinfo`
const QODER_MODEL_LIST_URL = `${QODER_CHAT_BASE}/algo/api/v2/model/list`

const QODER_CHAT_SIG_PATH = "/api/v2/service/pro/sse/agent_chat_generation"
const QODER_CHAT_URL = `${QODER_CHAT_BASE}/algo${QODER_CHAT_SIG_PATH}?FetchKeys=llm_model_result&AgentId=agent_common`
const QODER_CHAT_URL_ENCODED = `${QODER_CHAT_URL}&Encode=1`

const QODER_IDE_VERSION = "1.0.0"
const QODER_CLIENT_TYPE = "5"
const QODER_DATA_POLICY = "disagree"
const QODER_LOGIN_VERSION = "v2"
const QODER_MACHINE_OS = "x86_64_windows"
const QODER_MACHINE_TYPE = "5"

const QODER_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDA8iMH5c02LilrsERw9t6Pv5Nc
4k6Pz1EaDicBMpdpxKduSZu5OANqUq8er4GM95omAGIOPOh+Nx0spthYA2BqGz+l
6HRkPJ7S236FZz73In/KVuLnwI8JJ2CbuJap8kvheCCZpmAWpb/cPx/3Vr/J6I17
XcW+ML9FoCI6AOvOzwIDAQAB
-----END PUBLIC KEY-----`

const QODER_STD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const QODER_CUSTOM_ALPHABET = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!"

const QODER_S2C = (() => {
  const table = new Int16Array(128).fill(-1)
  for (let i = 0; i < 64; i++) {
    table[QODER_STD_ALPHABET.charCodeAt(i)] = QODER_CUSTOM_ALPHABET.charCodeAt(i)
  }
  table["=".charCodeAt(0)] = "$".charCodeAt(0)
  return table
})()

// Obfuscate / WAF bypass encode
function qoderEncodeBody(plaintext: Buffer | string): string {
  const buf = Buffer.isBuffer(plaintext)
    ? plaintext
    : typeof plaintext === "string"
      ? Buffer.from(plaintext, "utf8")
      : Buffer.from(plaintext as any)

  const std = buf.toString("base64")
  const n = std.length
  const a = Math.floor(n / 3)
  const rearranged = std.slice(n - a) + std.slice(a, n - a) + std.slice(0, a)

  const out = Buffer.alloc(n)
  for (let i = 0; i < n; i++) {
    const c = rearranged.charCodeAt(i)
    if (c < 128 && QODER_S2C[c] >= 0) {
      out[i] = QODER_S2C[c]
    } else {
      out[i] = c
    }
  }
  return out.toString("latin1")
}

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

function generatePkcePair() {
  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash("sha256").update(verifier).digest())
  return { verifier, challenge }
}

function pkcs7Pad(data: Buffer, blockSize: number): Buffer {
  const padding = blockSize - (data.length % blockSize)
  const padded = Buffer.alloc(data.length + padding, padding)
  data.copy(padded, 0)
  return padded
}

function aesEncryptCbcBase64(plaintext: string, keyStr: string): string {
  const keyBytes = Buffer.from(keyStr, "utf8")
  if (keyBytes.length !== 16) {
    throw new Error(`aes key must be 16 bytes, got ${keyBytes.length}`)
  }
  const iv = keyBytes.subarray(0, 16)
  const cipher = createCipheriv("aes-128-cbc", keyBytes, iv)
  cipher.setAutoPadding(false)
  const padded = pkcs7Pad(Buffer.from(plaintext, "utf8"), 16)
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()])
  return encrypted.toString("base64")
}

function rsaEncryptBase64(data: string): string {
  const encrypted = publicEncrypt(
    { key: QODER_RSA_PUBLIC_KEY, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(data, "utf8"),
  )
  return encrypted.toString("base64")
}

function encryptUserInfo(userInfo: any) {
  const aesKey = crypto.randomUUID().slice(0, 16)
  const plaintext = JSON.stringify(userInfo)
  const infoB64 = aesEncryptCbcBase64(plaintext, aesKey)
  const cosyKeyB64 = rsaEncryptBase64(aesKey)
  return { cosyKey: cosyKeyB64, info: infoB64 }
}

function md5Hex(input: Buffer | string): string {
  return createHash("md5").update(input).digest("hex")
}

function computeSigPath(requestUrl: string): string {
  let pathname: string
  try {
    pathname = new URL(requestUrl).pathname || ""
  } catch {
    return ""
  }
  if (pathname.startsWith("/algo")) {
    return pathname.slice("/algo".length)
  }
  return pathname
}

function buildCosyHeaders(
  body: Buffer,
  requestUrl: string,
  creds: { userId: string; authToken: string; name?: string; email?: string; machineId: string },
): Record<string, string> {
  const { cosyKey, info } = encryptUserInfo({
    uid: creds.userId,
    security_oauth_token: creds.authToken,
    name: creds.name || "",
    aid: "",
    email: creds.email || "",
  })

  const timestamp = String(Math.floor(Date.now() / 1000))
  const requestId = crypto.randomUUID()

  const payloadJson = JSON.stringify({
    version: "v1",
    requestId,
    info,
    cosyVersion: QODER_IDE_VERSION,
    ideVersion: "",
  })
  const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64")

  const sigPath = computeSigPath(requestUrl)
  const sigInput = `${payloadB64}\n${cosyKey}\n${timestamp}\n${body.toString("latin1")}\n${sigPath}`
  const sig = md5Hex(Buffer.from(sigInput, "latin1"))

  const machineId = creds.machineId
  const bodyHash = md5Hex(body)
  const bodyLength = String(body.length)

  return {
    Authorization: `Bearer COSY.${payloadB64}.${sig}`,
    "Cosy-Key": cosyKey,
    "Cosy-User": creds.userId,
    "Cosy-Date": timestamp,
    "Cosy-Version": QODER_IDE_VERSION,
    "Cosy-Machineid": machineId,
    "Cosy-Machinetoken": machineId,
    "Cosy-Machinetype": QODER_MACHINE_TYPE,
    "Cosy-Machineos": QODER_MACHINE_OS,
    "Cosy-Clienttype": QODER_CLIENT_TYPE,
    "Cosy-Clientip": "127.0.0.1",
    "Cosy-Bodyhash": bodyHash,
    "Cosy-Bodylength": bodyLength,
    "Cosy-Sigpath": sigPath,
    "Cosy-Data-Policy": QODER_DATA_POLICY,
    "Cosy-Organization-Id": "",
    "Cosy-Organization-Tags": "",
    "Login-Version": QODER_LOGIN_VERSION,
    "X-Request-Id": crypto.randomUUID(),
  }
}

// Caching and models list fetching
const catalogCache = new Map<string, { expiresAt: number; rawConfigs: Map<string, any> }>()
const CACHE_TTL_MS = 60 * 60 * 1000

async function fetchQoderCatalogRaw(creds: {
  userId: string
  authToken: string
  name?: string
  email?: string
  machineId: string
}) {
  const headers = {
    Accept: "application/json",
    "Accept-Encoding": "identity",
    ...buildCosyHeaders(Buffer.alloc(0), QODER_MODEL_LIST_URL, creds),
  }
  const res = await fetch(QODER_MODEL_LIST_URL, {
    method: "GET",
    headers,
  })
  if (!res.ok) return null
  const body = (await res.json().catch(() => null)) as { chat?: any[] } | null
  if (!body || !Array.isArray(body.chat)) return null

  const rawConfigs = new Map<string, any>()
  for (const entry of body.chat) {
    if (entry && entry.key) {
      rawConfigs.set(entry.key, entry)
    }
  }
  return rawConfigs
}

async function getQoderModelConfig(
  creds: { userId: string; authToken: string; name?: string; email?: string; machineId: string },
  modelKey: string,
) {
  const cacheKey = creds.userId
  const cached = catalogCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    const config = cached.rawConfigs.get(modelKey)
    if (config) return { ...config, key: modelKey }
  }
  const fetched = await fetchQoderCatalogRaw(creds)
  if (fetched) {
    catalogCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      rawConfigs: fetched,
    })
    const config = fetched.get(modelKey)
    if (config) return { ...config, key: modelKey }
  }
  return null
}

// Request transformation helpers
function extractText(content: any): string {
  if (typeof content === "string") return content
  if (content == null) return ""
  if (Array.isArray(content)) {
    const parts = []
    for (const item of content) {
      if (item && typeof item === "object") {
        if (item.type === "text" && typeof item.text === "string") {
          parts.push(item.text)
        } else if (typeof item.text === "string") {
          parts.push(item.text)
        }
      }
    }
    return parts.join("\n")
  }
  return String(content)
}

function normalizeMessages(messages: any[]) {
  const systemParts: string[] = []
  const out: any[] = []
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue
    const text = extractText(msg.content)
    if (msg.role === "system") {
      if (text) systemParts.push(text)
      continue
    }
    const cloned = { ...msg }
    cloned.content = text
    out.push(cloned)
  }
  return { messages: out, systemText: systemParts.join("\n\n") }
}

function lastUserText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role === "user" && typeof m.content === "string") {
      return m.content
    }
  }
  return ""
}

function stableHash(prefix: string, ...parts: any[]): string {
  const h = createHash("sha256")
  h.update(prefix)
  for (const p of parts) {
    h.update("\0")
    h.update(String(p ?? ""))
  }
  return h.digest("hex").slice(0, 16)
}

function stableChatRecordId(model: string, messages: any[], tools: any, maxTokens: number): string {
  const h = createHash("sha256")
  h.update("qoder-record\0")
  h.update(String(model))
  for (const m of messages) {
    if (!m || typeof m !== "object") continue
    if (m.role) {
      h.update("\0")
      h.update(m.role)
    }
    if (typeof m.content === "string" && m.content) {
      h.update("\0")
      h.update(m.content)
    }
  }
  if (tools) {
    h.update("\0")
    try {
      h.update(JSON.stringify(tools))
    } catch {}
  }
  h.update(`\0mt=${maxTokens}`)
  return h.digest("hex").slice(0, 16)
}

function truncate(s: string, n: number): string {
  return s && s.length > n ? `${s.slice(0, n)}...` : s || ""
}

// SSE wrapper
function wrapQoderSSE(response: Response, model: string): Response {
  if (!response.ok || !response.body) return response

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  let doneEmitted = false

  const processLine = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    const trimmed = line.replace(/\r$/, "").trim()
    if (!trimmed) return
    if (!trimmed.startsWith("data:")) return
    if (doneEmitted) return

    const data = trimmed.slice(5).trimStart()
    if (data === "[DONE]") {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      doneEmitted = true
      return
    }

    let envelope: any
    try {
      envelope = JSON.parse(data)
    } catch {
      return
    }
    const statusVal = typeof envelope.statusCodeValue === "number" ? envelope.statusCodeValue : 200
    const inner = typeof envelope.body === "string" ? envelope.body : ""
    if (statusVal !== 200) {
      const msg = inner || `upstream status ${statusVal}`
      const errChunk = JSON.stringify({
        id: `qoder-error-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: { content: `\n[qoder error ${statusVal}: ${truncate(msg, 200)}]` },
            finish_reason: "stop",
          },
        ],
      })
      controller.enqueue(encoder.encode(`data: ${errChunk}\n\n`))
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      doneEmitted = true
      return
    }
    if (!inner) return
    if (inner === "[DONE]") {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      doneEmitted = true
      return
    }
    const sanitized = inner.replace(/\r?\n/g, "")
    controller.enqueue(encoder.encode(`data: ${sanitized}\n\n`))
  }

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      let nl
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        processLine(line, controller)
      }
    },
    flush(controller) {
      buffer += decoder.decode()
      if (buffer.length > 0) {
        processLine(buffer, controller)
        buffer = ""
      }
      if (!doneEmitted) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        doneEmitted = true
      }
    },
  })

  const transformed = response.body.pipeThrough(transform)
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  })
}

// OAuth API client helpers
async function fetchUserInfo(accessToken: string) {
  try {
    const response = await fetch(QODER_USERINFO_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "Go-http-client/2.0",
      },
    })
    if (!response.ok) return { name: "", email: "", organizationId: "" }
    const body = (await response.json()) as any
    return {
      name: (body.name || body.username || "").trim(),
      email: (body.email || "").trim(),
      organizationId: (body.organization_id || "").trim(),
    }
  } catch {
    return { name: "", email: "", organizationId: "" }
  }
}

async function pollDeviceToken({ nonce, codeVerifier }: { nonce: string; codeVerifier: string }) {
  const url = `${QODER_DEVICE_TOKEN_URL}?nonce=${encodeURIComponent(nonce)}&verifier=${encodeURIComponent(codeVerifier)}&challenge_method=S256`
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Go-http-client/2.0",
    },
  })
  if (response.status === 202 || response.status === 404) {
    return { status: "pending" as const }
  }
  if (!response.ok) {
    throw new Error(`Qoder device token poll failed: HTTP ${response.status}`)
  }
  const body = (await response.json()) as any
  if (!body.token) {
    throw new Error("Qoder device token poll returned 200 but no token")
  }
  const expireMs = body.expires_at
    ? typeof body.expires_at === "number"
      ? body.expires_at
      : Date.parse(body.expires_at)
    : Date.now() + (body.expires_in ?? 30 * 24 * 60 * 60) * 1000

  return {
    status: "ok" as const,
    accessToken: body.token,
    refreshToken: body.refresh_token || "",
    userId: body.user_id || "",
    expireTime: expireMs,
  }
}

export async function QoderAuthPlugin(input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "qoder",
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth.type !== "oauth") return {}

        return {
          apiKey: OAUTH_DUMMY_KEY,
          async fetch(requestInput: RequestInfo | URL, init?: RequestInit) {
            const current = await getAuth()
            if (current.type !== "oauth") return fetch(requestInput, init)

            const creds = {
              userId: current.accountId || "",
              authToken: current.access,
              name: (current as any).displayName || "",
              email: (current as any).email || "",
              machineId: (current as any).machineId || "",
            }

            if (!creds.userId || !creds.authToken) {
              return new Response(
                JSON.stringify({ error: { message: "Qoder credential is missing; reconnect the account" } }),
                { status: 401, headers: { "Content-Type": "application/json" } },
              )
            }

            // Parse request input and body
            const bodyStr = init?.body ? String(init.body) : ""
            let parsedBody: any = {}
            try {
              if (bodyStr) parsedBody = JSON.parse(bodyStr)
            } catch {}

            const model = parsedBody.model || ""
            const qoderKey = String(model).replace(/^qoder\//, "")

            // Get live Qoder model config
            let modelConfig = await getQoderModelConfig(creds, qoderKey)
            if (!modelConfig) {
              // Try forced config reload once
              const raw = await fetchQoderCatalogRaw(creds)
              if (raw) {
                catalogCache.set(creds.userId, {
                  expiresAt: Date.now() + CACHE_TTL_MS,
                  rawConfigs: raw,
                })
                modelConfig = raw.get(qoderKey)
              }
            }

            if (!modelConfig) {
              return new Response(
                JSON.stringify({ error: { message: `Qoder: model_config for "${qoderKey}" not found.` } }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              )
            }

            const { messages, systemText } = normalizeMessages(parsedBody.messages || [])
            const tools = parsedBody.tools
            const isReasoning = !!modelConfig.is_reasoning
            const maxOutputTokens = Number(modelConfig.max_output_tokens) || 0

            let maxTokens = 32768
            if (maxOutputTokens > 0) maxTokens = maxOutputTokens
            if (typeof parsedBody.max_tokens === "number" && parsedBody.max_tokens > 0 && parsedBody.max_tokens < maxTokens) {
              maxTokens = parsedBody.max_tokens
            }
            if (typeof parsedBody.max_completion_tokens === "number" && parsedBody.max_completion_tokens > 0 && parsedBody.max_completion_tokens < maxTokens) {
              maxTokens = parsedBody.max_completion_tokens
            }

            const lastUser = lastUserText(messages)
            const sessionId = stableHash("qoder-session", creds.userId, qoderKey)
            const recordId = stableChatRecordId(qoderKey, messages, tools, maxTokens)

            const payload = {
              request_id: crypto.randomUUID(),
              request_set_id: recordId,
              chat_record_id: recordId,
              session_id: sessionId,
              stream: true,
              chat_task: "FREE_INPUT",
              is_reply: true,
              is_retry: false,
              source: 1,
              version: "3",
              session_type: "qodercli",
              agent_id: "agent_common",
              task_id: "common",
              code_language: "",
              chat_prompt: "",
              image_urls: null,
              aliyun_user_type: "",
              system: systemText,
              messages,
              tools: Array.isArray(tools) ? tools : [],
              parameters: { max_tokens: maxTokens },
              chat_context: {
                chatPrompt: "",
                imageUrls: null,
                extra: {
                  context: [],
                  modelConfig: { key: qoderKey, is_reasoning: isReasoning },
                  originalContent: lastUser,
                },
                features: [],
                text: lastUser,
              },
              model_config: modelConfig,
              business: {
                product: "cli",
                version: "1.0.0",
                type: "agent",
                stage: "start",
                id: crypto.randomUUID(),
                name: truncate(lastUser, 30),
                begin_at: Date.now(),
              },
            }

            const plainBody = Buffer.from(JSON.stringify(payload), "utf8")
            const encodedBodyStr = qoderEncodeBody(plainBody)
            const encodedBodyBuf = Buffer.from(encodedBodyStr, "latin1")

            let cosyHeaders: Record<string, string>
            try {
              cosyHeaders = buildCosyHeaders(encodedBodyBuf, QODER_CHAT_URL_ENCODED, creds)
            } catch (err: any) {
              return new Response(
                JSON.stringify({ error: { message: `Qoder cosy signing failed: ${err.message}` } }),
                { status: 401, headers: { "Content-Type": "application/json" } },
              )
            }

            const headers = new Headers(init?.headers)
            headers.set("Content-Type", "application/json")
            headers.set("Accept", "text/event-stream")
            headers.set("Cache-Control", "no-cache")
            headers.set("X-Model-Key", qoderKey)
            headers.set("X-Model-Source", modelConfig.source || "system")
            headers.set("Accept-Encoding", "identity")
            for (const [k, v] of Object.entries(cosyHeaders)) {
              headers.set(k, v)
            }

            const res = await fetch(QODER_CHAT_URL_ENCODED, {
              ...init,
              method: "POST",
              headers,
              body: encodedBodyBuf,
            })

            if (!res.ok) return res

            const wrapped = wrapQoderSSE(res, `qoder/${qoderKey}`)
            const isStream = parsedBody.stream === true

            if (!isStream) {
              if (!wrapped.body) return wrapped
              const reader = wrapped.body.getReader()
              let text = ""
              let reasoningText = ""
              let done = false
              while (!done) {
                const { value, done: readerDone } = await reader.read()
                if (readerDone) break
                const chunkStr = new TextDecoder().decode(value)
                const lines = chunkStr.split("\n")
                for (const line of lines) {
                  const trimmed = line.trim()
                  if (!trimmed || !trimmed.startsWith("data:")) continue
                  const data = trimmed.slice(5).trim()
                  if (data === "[DONE]") continue
                  try {
                    const parsed = JSON.parse(data)
                    const content = parsed.choices?.[0]?.delta?.content ?? ""
                    text += content
                    const reasoning = parsed.choices?.[0]?.delta?.reasoning_content ?? ""
                    reasoningText += reasoning
                  } catch {}
                }
              }
              const responseObj = {
                id: `qoder-${Date.now()}`,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    message: {
                      role: "assistant",
                      content: text,
                      ...(reasoningText && { reasoning_content: reasoningText }),
                    },
                    finish_reason: "stop",
                  },
                ],
              }
              return new Response(JSON.stringify(responseObj), {
                headers: { "Content-Type": "application/json" },
              })
            }

            return wrapped
          },
        }
      },
      methods: [
        {
          label: "Qoder (browser)",
          type: "oauth",
          authorize: async () => {
            const { verifier, challenge } = generatePkcePair()
            const nonce = crypto.randomUUID()
            const machineId = crypto.randomUUID()

            const params = new URLSearchParams({
              challenge,
              challenge_method: "S256",
              machine_id: machineId,
              nonce,
            })
            const url = `${QODER_LOGIN_URL}?${params.toString()}`

            return {
              url,
              instructions: "Complete Qoder authorization in browser",
              method: "auto" as const,
              callback: async () => {
                const end = Date.now() + 5 * 60 * 1000 // 5 minutes timeout
                while (Date.now() < end) {
                  try {
                    const out = await pollDeviceToken({ nonce, codeVerifier: verifier })
                    if (out.status === "ok") {
                      const userInfo = await fetchUserInfo(out.accessToken)
                      const rawEmail = (userInfo.email || "").trim()
                      const email = rawEmail || `qoder-user-${out.userId}`
                      return {
                        type: "success" as const,
                        refresh: out.refreshToken,
                        access: out.accessToken,
                        expires: out.expireTime,
                        accountId: out.userId,
                        machineId,
                        displayName: userInfo.name,
                        email,
                        organizationId: userInfo.organizationId,
                      }
                    }
                  } catch (error) {
                    log.warn("qoder poll attempt error", { error })
                  }
                  await sleep(2000) // Poll every 2 seconds
                }
                log.warn("qoder oauth flow timed out")
                return { type: "failed" as const }
              },
            }
          },
        },
      ],
    },
  }
}
