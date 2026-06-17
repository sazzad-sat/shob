declare global {
  const SHOB_VERSION: string
  const SHOB_CHANNEL: string
}

export const VERSION = typeof SHOB_VERSION === "string" ? SHOB_VERSION : "local"
export const CHANNEL = typeof SHOB_CHANNEL === "string" ? SHOB_CHANNEL : "local"
