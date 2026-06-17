import { Config } from "effect"

function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function falsy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

export namespace Flag {
  export const OTEL_EXPORTER_OTLP_ENDPOINT = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]
  export const OTEL_EXPORTER_OTLP_HEADERS = process.env["OTEL_EXPORTER_OTLP_HEADERS"]

  export const SHOB_AUTO_SHARE = truthy("SHOB_AUTO_SHARE")
  export const SHOB_AUTO_HEAP_SNAPSHOT = truthy("SHOB_AUTO_HEAP_SNAPSHOT")
  export const SHOB_GIT_BASH_PATH = process.env["SHOB_GIT_BASH_PATH"]
  export const SHOB_CONFIG = process.env["SHOB_CONFIG"]
  export declare const SHOB_PURE: boolean
  export declare const SHOB_TUI_CONFIG: string | undefined
  export declare const SHOB_CONFIG_DIR: string | undefined
  export declare const SHOB_PLUGIN_META_FILE: string | undefined
  export const SHOB_CONFIG_CONTENT = process.env["SHOB_CONFIG_CONTENT"]
  export const SHOB_DISABLE_AUTOUPDATE = truthy("SHOB_DISABLE_AUTOUPDATE")
  export const SHOB_ALWAYS_NOTIFY_UPDATE = truthy("SHOB_ALWAYS_NOTIFY_UPDATE")
  export const SHOB_DISABLE_PRUNE = truthy("SHOB_DISABLE_PRUNE")
  export const SHOB_DISABLE_TERMINAL_TITLE = truthy("SHOB_DISABLE_TERMINAL_TITLE")
  export const SHOB_SHOW_TTFD = truthy("SHOB_SHOW_TTFD")
  export const SHOB_PERMISSION = process.env["SHOB_PERMISSION"]
  export const SHOB_DISABLE_DEFAULT_PLUGINS = truthy("SHOB_DISABLE_DEFAULT_PLUGINS")
  export const SHOB_DISABLE_LSP_DOWNLOAD = truthy("SHOB_DISABLE_LSP_DOWNLOAD")
  export const SHOB_ENABLE_EXPERIMENTAL_MODELS = truthy("SHOB_ENABLE_EXPERIMENTAL_MODELS")
  export const SHOB_DISABLE_AUTOCOMPACT = truthy("SHOB_DISABLE_AUTOCOMPACT")
  export const SHOB_DISABLE_MODELS_FETCH = truthy("SHOB_DISABLE_MODELS_FETCH")
  export const SHOB_DISABLE_MOUSE = truthy("SHOB_DISABLE_MOUSE")
  export const SHOB_DISABLE_CLAUDE_CODE = truthy("SHOB_DISABLE_CLAUDE_CODE")
  export const SHOB_DISABLE_CLAUDE_CODE_PROMPT =
    SHOB_DISABLE_CLAUDE_CODE || truthy("SHOB_DISABLE_CLAUDE_CODE_PROMPT")
  export const SHOB_DISABLE_CLAUDE_CODE_SKILLS =
    SHOB_DISABLE_CLAUDE_CODE || truthy("SHOB_DISABLE_CLAUDE_CODE_SKILLS")
  export const SHOB_DISABLE_EXTERNAL_SKILLS =
    SHOB_DISABLE_CLAUDE_CODE_SKILLS || truthy("SHOB_DISABLE_EXTERNAL_SKILLS")
  export declare const SHOB_DISABLE_PROJECT_CONFIG: boolean
  export const SHOB_FAKE_VCS = process.env["SHOB_FAKE_VCS"]
  export declare const SHOB_CLIENT: string
  export const SHOB_SERVER_PASSWORD = process.env["SHOB_SERVER_PASSWORD"]
  export const SHOB_SERVER_USERNAME = process.env["SHOB_SERVER_USERNAME"]
  export const SHOB_ENABLE_QUESTION_TOOL = truthy("SHOB_ENABLE_QUESTION_TOOL")

  // Experimental
  export const SHOB_EXPERIMENTAL = truthy("SHOB_EXPERIMENTAL")
  export const SHOB_EXPERIMENTAL_FILEWATCHER = Config.boolean("SHOB_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  )
  export const SHOB_EXPERIMENTAL_DISABLE_FILEWATCHER = Config.boolean(
    "SHOB_EXPERIMENTAL_DISABLE_FILEWATCHER",
  ).pipe(Config.withDefault(false))
  export const SHOB_EXPERIMENTAL_ICON_DISCOVERY =
    SHOB_EXPERIMENTAL || truthy("SHOB_EXPERIMENTAL_ICON_DISCOVERY")

  const copy = process.env["SHOB_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
  export const SHOB_EXPERIMENTAL_DISABLE_COPY_ON_SELECT =
    copy === undefined ? process.platform === "win32" : truthy("SHOB_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const SHOB_ENABLE_EXA =
    truthy("SHOB_ENABLE_EXA") || SHOB_EXPERIMENTAL || truthy("SHOB_EXPERIMENTAL_EXA")
  export const SHOB_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("SHOB_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const SHOB_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("SHOB_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const SHOB_EXPERIMENTAL_OXFMT = SHOB_EXPERIMENTAL || truthy("SHOB_EXPERIMENTAL_OXFMT")
  export const SHOB_EXPERIMENTAL_LSP_TY = truthy("SHOB_EXPERIMENTAL_LSP_TY")
  export const SHOB_EXPERIMENTAL_LSP_TOOL = SHOB_EXPERIMENTAL || truthy("SHOB_EXPERIMENTAL_LSP_TOOL")
  export const SHOB_DISABLE_FILETIME_CHECK = Config.boolean("SHOB_DISABLE_FILETIME_CHECK").pipe(
    Config.withDefault(false),
  )
  export const SHOB_EXPERIMENTAL_PLAN_MODE = SHOB_EXPERIMENTAL || truthy("SHOB_EXPERIMENTAL_PLAN_MODE")
  export const SHOB_EXPERIMENTAL_WORKSPACES = SHOB_EXPERIMENTAL || truthy("SHOB_EXPERIMENTAL_WORKSPACES")
  export const SHOB_EXPERIMENTAL_MARKDOWN = !falsy("SHOB_EXPERIMENTAL_MARKDOWN")
  export const SHOB_MODELS_URL = process.env["SHOB_MODELS_URL"]
  export const SHOB_MODELS_PATH = process.env["SHOB_MODELS_PATH"]
  export const SHOB_DISABLE_EMBEDDED_WEB_UI = truthy("SHOB_DISABLE_EMBEDDED_WEB_UI")
  export const SHOB_DB = process.env["SHOB_DB"]
  export const SHOB_DISABLE_CHANNEL_DB = truthy("SHOB_DISABLE_CHANNEL_DB")
  export const SHOB_SKIP_MIGRATIONS = truthy("SHOB_SKIP_MIGRATIONS")
  export const SHOB_STRICT_CONFIG_DEPS = truthy("SHOB_STRICT_CONFIG_DEPS")

  function number(key: string) {
    const value = process.env[key]
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }
}

// Dynamic getter for SHOB_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "SHOB_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("SHOB_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for SHOB_TUI_CONFIG
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "SHOB_TUI_CONFIG", {
  get() {
    return process.env["SHOB_TUI_CONFIG"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for SHOB_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "SHOB_CONFIG_DIR", {
  get() {
    return process.env["SHOB_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for SHOB_PURE
// This must be evaluated at access time, not module load time,
// because the CLI can set this flag at runtime
Object.defineProperty(Flag, "SHOB_PURE", {
  get() {
    return truthy("SHOB_PURE")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for SHOB_PLUGIN_META_FILE
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "SHOB_PLUGIN_META_FILE", {
  get() {
    return process.env["SHOB_PLUGIN_META_FILE"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for SHOB_CLIENT
// This must be evaluated at access time, not module load time,
// because some commands override the client at runtime
Object.defineProperty(Flag, "SHOB_CLIENT", {
  get() {
    return process.env["SHOB_CLIENT"] ?? "cli"
  },
  enumerable: true,
  configurable: false,
})
