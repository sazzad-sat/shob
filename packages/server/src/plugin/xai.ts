import type { Hooks, PluginInput } from "@shob-ai/plugin"
import { randomBytes, createHash } from "node:crypto"
import { OAUTH_DUMMY_KEY } from "../auth"
import { Log } from "../util/log"

const log = Log.create({ service: "plugin.xai" })

const CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828"
const ISSUER = "https://auth.x.ai"
const AUTHORIZE_URL = `${ISSUER}/oauth2/authorize`
const TOKEN_URL = `${ISSUER}/oauth2/token`
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`
const REDIRECT_URI = "http://127.0.0.1:56121/callback"
const SCOPE = "openid profile email offline_access grok-cli:access api:access"
const USER_AGENT = "grok-cli/9router"
const REFRESH_LEAD_MS = 5 * 60 * 1000

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
}

let endpoints: { authorizeUrl: string; tokenUrl: string } | undefined

function base64Url(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function createPKCE() {
  const verifier = base64Url(randomBytes(96))
  const challenge = base64Url(createHash("sha256").update(verifier).digest())
  return { verifier, challenge }
}

function createState() {
  return base64Url(randomBytes(32))
}

function validXaiEndpoint(raw: unknown, fallback: string) {
  if (typeof raw !== "string" || !raw) return fallback
  const url = new URL(raw)
  const host = url.hostname.toLowerCase()
  if (url.protocol !== "https:" || (host !== "x.ai" && !host.endsWith(".x.ai"))) return fallback
  return raw
}

async function discoverEndpoints() {
  if (endpoints) return endpoints
  try {
    const res = await fetch(DISCOVERY_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    })
    if (res.ok) {
      const json = (await res.json()) as {
        authorization_endpoint?: string
        token_endpoint?: string
      }
      endpoints = {
        authorizeUrl: validXaiEndpoint(json.authorization_endpoint, AUTHORIZE_URL),
        tokenUrl: validXaiEndpoint(json.token_endpoint, TOKEN_URL),
      }
      return endpoints
    }
  } catch (error) {
    log.warn("xai discovery failed, using static endpoints", { error })
  }
  endpoints = { authorizeUrl: AUTHORIZE_URL, tokenUrl: TOKEN_URL }
  return endpoints
}

function buildAuthorizeUrl(authorizeUrl: string, state: string, challenge: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    nonce: randomBytes(16).toString("hex"),
    plan: "generic",
    referrer: "cli-proxy-api",
  })
  return `${authorizeUrl}?${params.toString()}`
}

function extractCode(value: string, expectedState: string) {
  const trimmed = value.trim()
  try {
    const url = new URL(trimmed)
    const state = url.searchParams.get("state")
    if (state && state !== expectedState) throw new Error("OAuth state mismatch")
    return url.searchParams.get("code") ?? trimmed
  } catch (error) {
    if (error instanceof Error && error.message === "OAuth state mismatch") throw error
    return trimmed
  }
}

function decodeAccountId(idToken?: string) {
  if (!idToken) return
  const parts = idToken.split(".")
  if (parts.length !== 3) return
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as {
      email?: string
      preferred_username?: string
      sub?: string
    }
    return payload.email ?? payload.preferred_username ?? payload.sub
  } catch {
    return
  }
}

async function exchangeToken(code: string, verifier: string) {
  const { tokenUrl } = await discoverEndpoints()
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) throw new Error(`xAI token exchange failed (${res.status}): ${await res.text()}`)
  return (await res.json()) as TokenResponse
}

async function refreshToken(refresh: string) {
  const { tokenUrl } = await discoverEndpoints()
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refresh,
    }),
  })
  if (!res.ok) throw new Error(`xAI token refresh failed (${res.status}): ${await res.text()}`)
  return (await res.json()) as TokenResponse
}

export async function XaiAuthPlugin(input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "xai",
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth.type !== "oauth") return {}

        return {
          apiKey: OAUTH_DUMMY_KEY,
          async fetch(requestInput: RequestInfo | URL, init?: RequestInit) {
            const current = await getAuth()
            if (current.type !== "oauth") return fetch(requestInput, init)

            let access = current.access
            if (current.expires - Date.now() < REFRESH_LEAD_MS) {
              const next = await refreshToken(current.refresh)
              const refresh = next.refresh_token ?? current.refresh
              const expires = Date.now() + (next.expires_in ?? 3600) * 1000
              await input.client.auth.set({
                path: { id: "xai" },
                body: {
                  type: "oauth",
                  refresh,
                  access: next.access_token,
                  expires,
                  ...(decodeAccountId(next.id_token) && { accountId: decodeAccountId(next.id_token) }),
                },
              })
              access = next.access_token
            }

            const headers = new Headers(init?.headers)
            headers.set("Authorization", `Bearer ${access}`)
            headers.set("User-Agent", USER_AGENT)
            return fetch(requestInput, { ...init, headers })
          },
        }
      },
      methods: [
        {
          label: "Grok Build OAuth",
          type: "oauth",
          authorize: async () => {
            const { authorizeUrl } = await discoverEndpoints()
            const pkce = createPKCE()
            const state = createState()

            return {
              url: buildAuthorizeUrl(authorizeUrl, state, pkce.challenge),
              instructions: "Open xAI and paste the callback URL or authorization code.",
              method: "code" as const,
              callback: async (value: string) => {
                const tokens = await exchangeToken(extractCode(value, state), pkce.verifier)
                if (!tokens.refresh_token) return { type: "failed" as const }
                return {
                  type: "success" as const,
                  refresh: tokens.refresh_token,
                  access: tokens.access_token,
                  expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
                  ...(decodeAccountId(tokens.id_token) && { accountId: decodeAccountId(tokens.id_token) }),
                }
              },
            }
          },
        },
        {
          label: "xAI API Key",
          type: "api",
        },
      ],
    },
  }
}
