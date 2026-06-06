import { afterEach, expect, mock, test } from "bun:test"
import { ProviderRoutes } from "../../src/server/routes/provider"
import { Log } from "../../src/util/log"

Log.init({ print: false })

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test("openai-compatible model fetch uses the provider models endpoint", async () => {
  const fetchMock = mock((input: string | URL | Request, init?: RequestInit) => {
    expect(String(input)).toBe("https://api.example.com/v1/models")
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key")
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "example/model",
              name: "Example Model",
            },
          ],
        }),
        { status: 200 },
      ),
    )
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch

  const response = await ProviderRoutes().request("/openai-compatible/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseURL: "https://api.example.com/v1",
      apiKey: "test-key",
    }),
  })

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    data: [
      {
        id: "example/model",
        name: "Example Model",
      },
    ],
  })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test("gitlawb opengateway fetches models from the live catalog page", async () => {
  const fetchMock = mock((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url === "https://opengateway.gitlawb.com/v1/models") {
      throw new Error("OpenGateway should not use /models discovery")
    }
    if (url === "https://gitlawb.com/opengateway") {
      expect((init?.headers as Record<string, string>).Accept).toBe("text/html")
      return Promise.resolve(
        new Response(
          `
            <p>MiMo V2.5-Pro</p>
            <p><span>model:</span> <!-- -->xiaomi/mimo-v2.5-pro</p>
            <p>Nemotron 3 Ultra FREE</p>
            <p><span>model:</span> <!-- -->nvidia/nemotron-3-ultra-550b-a55b:free</p>
          `,
          { status: 200 },
        ),
      )
    }

    throw new Error(`unexpected fetch ${url}`)
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch

  const response = await ProviderRoutes().request("/openai-compatible/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseURL: "https://opengateway.gitlawb.com/v1",
      apiKey: "ogw_live_test",
    }),
  })

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    data: [
      { id: "xiaomi/mimo-v2.5-pro" },
      { id: "nvidia/nemotron-3-ultra-550b-a55b:free" },
    ],
  })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
