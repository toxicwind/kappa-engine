import { InstallationChannel } from "../installation/version" // kappacode_change

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

// kappacode_change start
function falsy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

const UNSTABLE_CHANNELS = new Set(["dev", "beta", "local"])
function unstableDefault(key: string) {
  return kiloTruthy(key) || (!kiloFalsy(key) && UNSTABLE_CHANNELS.has(InstallationChannel))
}

function number(key: string) {
  const value = process.env[key]
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

// kappacode_change start
// Kilo/OpenCode backwards-compat shim. Kappa is a derivative of OpenCode/Kilo;
// existing deployments and tooling set `KILO_*` (and the older `OPENCODE_*`)
// env vars. Every `KAPPA_*` read falls back to the upstream equivalents so a
// Kilo/OpenCode-configured environment keeps working without re-exporting.
// KAPPA_* wins when both are set (kappa's own names are canonical); the
// `_KAPPA_*` middle form is also honoured for symmetry.
export function kiloEnv(key: string): string | undefined {
  return process.env[`KAPPA_${key}`] ?? process.env[`KILO_${key}`] ?? process.env[`OPENCODE_${key}`] ?? process.env[`_KAPPA_${key}`]
}
export function kiloTruthy(key: string): boolean {
  const value = kiloEnv(key)?.toLowerCase()
  return value === "true" || value === "1"
}
export function kiloFalsy(key: string): boolean {
  const value = kiloEnv(key)?.toLowerCase()
  return value === "false" || value === "0"
}
export function kiloNumber(key: string): number | undefined {
  const value = kiloEnv(key)
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}
// kappacode_change start — expose the kilo env helpers as RUNTIME globals.
// The migration commit (fd4b92e5) removed the global exposure that made
// kiloEnv / kiloTruthy / kiloFalsy / kiloNumber available without import.
// ~100 call sites across packages/cli/src use them as bare globals (no
// import). The ambient `declare global` in bun-compat.d.ts satisfies the
// typechecker but NOT the JS runtime — without this assignment every such
// call site throws `ReferenceError: kiloEnv is not defined`. Assign to
// globalThis so the existing call sites resolve at runtime.
;(globalThis as Record<string, unknown>).kiloEnv = kiloEnv
;(globalThis as Record<string, unknown>).kiloTruthy = kiloTruthy
;(globalThis as Record<string, unknown>).kiloFalsy = kiloFalsy
;(globalThis as Record<string, unknown>).kiloNumber = kiloNumber
// kappacode_change end

const KAPPA_EXPERIMENTAL = kiloTruthy("EXPERIMENTAL")
const KAPPA_DISABLE_CLAUDE_CODE = kiloTruthy("DISABLE_CLAUDE_CODE")
const KAPPA_DISABLE_CLAUDE_CODE_SKILLS = KAPPA_DISABLE_CLAUDE_CODE || kiloTruthy("DISABLE_CLAUDE_CODE_SKILLS")
// kappacode_change end
const copy = kiloEnv("EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
const fff = kiloEnv("DISABLE_FFF")

function enabledByExperimental(key: string) {
  return kiloEnv(key) === undefined ? kiloTruthy("EXPERIMENTAL") : kiloTruthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  KAPPA_AUTO_SHARE: kiloTruthy("AUTO_SHARE"), // kappacode_change
  KAPPA_AUTO_HEAP_SNAPSHOT: kiloTruthy("AUTO_HEAP_SNAPSHOT"),
  KAPPA_GIT_BASH_PATH: kiloEnv("GIT_BASH_PATH"),
  KAPPA_CONFIG: kiloEnv("CONFIG"),
  KAPPA_CONFIG_CONTENT: kiloEnv("CONFIG_CONTENT"),
  KAPPA_DISABLE_AUTOUPDATE: kiloTruthy("DISABLE_AUTOUPDATE"),
  KAPPA_ALWAYS_NOTIFY_UPDATE: kiloTruthy("ALWAYS_NOTIFY_UPDATE"),
  KAPPA_DISABLE_PRUNE: kiloTruthy("DISABLE_PRUNE"),
  KAPPA_DISABLE_TERMINAL_TITLE: kiloTruthy("DISABLE_TERMINAL_TITLE"),
  KAPPA_SHOW_TTFD: kiloTruthy("SHOW_TTFD"),
  // kappacode_change start
  KAPPA_DISABLE_DEFAULT_PLUGINS: kiloTruthy("DISABLE_DEFAULT_PLUGINS"),
  KAPPA_DISABLE_LSP_DOWNLOAD: kiloTruthy("DISABLE_LSP_DOWNLOAD"),
  KAPPA_ENABLE_EXPERIMENTAL_MODELS: kiloTruthy("ENABLE_EXPERIMENTAL_MODELS"),
  // kappacode_change end
  KAPPA_DISABLE_AUTOCOMPACT: kiloTruthy("DISABLE_AUTOCOMPACT"),
  KAPPA_DISABLE_MODELS_FETCH: kiloTruthy("DISABLE_MODELS_FETCH"),
  KAPPA_DISABLE_MOUSE: kiloTruthy("DISABLE_MOUSE"),
  // kappacode_change start
  KAPPA_DISABLE_CLAUDE_CODE,
  KAPPA_DISABLE_CLAUDE_CODE_PROMPT: KAPPA_DISABLE_CLAUDE_CODE || kiloTruthy("DISABLE_CLAUDE_CODE_PROMPT"),
  KAPPA_DISABLE_CLAUDE_CODE_SKILLS,
  KAPPA_DISABLE_EXTERNAL_SKILLS: kiloTruthy("DISABLE_EXTERNAL_SKILLS"),
  KAPPA_EXPERIMENTAL_CUSTOMIZE_SKILL: unstableDefault("EXPERIMENTAL_CUSTOMIZE_SKILL"),
  // kappacode_change end
  KAPPA_FAKE_VCS: kiloEnv("FAKE_VCS"),
  KAPPA_SERVER_PASSWORD: kiloEnv("SERVER_PASSWORD"),
  KAPPA_SERVER_USERNAME: kiloEnv("SERVER_USERNAME"),
  KAPPA_ENABLE_QUESTION_TOOL: kiloTruthy("ENABLE_QUESTION_TOOL"), // kappacode_change

  KAPPA_EXPERIMENTAL, // kappacode_change

  KAPPA_EXPERIMENTAL_CLAUDE_MIGRATION: kiloTruthy("EXPERIMENTAL_CLAUDE_MIGRATION"), // kappacode_change

  KAPPA_EXPERIMENTAL_FILEWATCHER: kiloTruthy("EXPERIMENTAL_FILEWATCHER"), // kappacode_change

  KAPPA_EXPERIMENTAL_DISABLE_FILEWATCHER: kiloTruthy("EXPERIMENTAL_DISABLE_FILEWATCHER"),

  KAPPA_EXPERIMENTAL_ICON_DISCOVERY: KAPPA_EXPERIMENTAL || kiloTruthy("EXPERIMENTAL_ICON_DISCOVERY"), // kappacode_change

  KAPPA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : kiloTruthy("EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),

  KAPPA_ENABLE_EXA: kiloTruthy("ENABLE_EXA") || KAPPA_EXPERIMENTAL || kiloTruthy("EXPERIMENTAL_EXA"), // kappacode_change

  KAPPA_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: kiloNumber("EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"), // kappacode_change

  KAPPA_EXPERIMENTAL_OUTPUT_TOKEN_MAX: kiloNumber("EXPERIMENTAL_OUTPUT_TOKEN_MAX"), // kappacode_change

  KAPPA_EXPERIMENTAL_OXFMT: KAPPA_EXPERIMENTAL || kiloTruthy("EXPERIMENTAL_OXFMT"), // kappacode_change

  KAPPA_EXPERIMENTAL_LSP_TY: kiloTruthy("EXPERIMENTAL_LSP_TY"), // kappacode_change

  KAPPA_EXPERIMENTAL_LSP_TOOL: KAPPA_EXPERIMENTAL || kiloTruthy("EXPERIMENTAL_LSP_TOOL"), // kappacode_change

  KAPPA_EXPERIMENTAL_SCOUT: KAPPA_EXPERIMENTAL || kiloTruthy("EXPERIMENTAL_SCOUT"), // kappacode_change

  KAPPA_EXPERIMENTAL_MARKDOWN: !kiloFalsy("EXPERIMENTAL_MARKDOWN"), // kappacode_change

  KAPPA_ENABLE_PARALLEL: kiloTruthy("ENABLE_PARALLEL") || kiloTruthy("EXPERIMENTAL_PARALLEL"), // kappacode_change

  KAPPA_MODELS_URL: kiloEnv("MODELS_URL"),

  KAPPA_MODELS_PATH: kiloEnv("MODELS_PATH"),

  KAPPA_DISABLE_EMBEDDED_WEB_UI: kiloTruthy("DISABLE_EMBEDDED_WEB_UI"), // kappacode_change

  KAPPA_DB: kiloEnv("DB"),

  KAPPA_DISABLE_CHANNEL_DB: kiloTruthy("DISABLE_CHANNEL_DB"), // kappacode_change

  KAPPA_SKIP_MIGRATIONS: kiloTruthy("SKIP_MIGRATIONS"), // kappacode_change

  KAPPA_STRICT_CONFIG_DEPS: kiloTruthy("STRICT_CONFIG_DEPS"), // kappacode_change

  KAPPA_WORKSPACE_ID: kiloEnv("WORKSPACE_ID"),

  KAPPA_EXPERIMENTAL_WORKSPACES: enabledByExperimental("EXPERIMENTAL_WORKSPACES"),

  KAPPA_EXPERIMENTAL_EVENT_SYSTEM: KAPPA_EXPERIMENTAL || kiloTruthy("EXPERIMENTAL_EVENT_SYSTEM"), // kappacode_change

  KAPPA_EXPERIMENTAL_SESSION_SWITCHING: KAPPA_EXPERIMENTAL || kiloTruthy("EXPERIMENTAL_SESSION_SWITCHING"), // kappacode_change

  KAPPA_EXPERIMENTAL_SESSION_SWITCHER: enabledByExperimental("EXPERIMENTAL_SESSION_SWITCHER"), // kappacode_change

  KAPPA_DISABLE_FFF: fff === undefined ? process.platform === "win32" : kiloTruthy("DISABLE_FFF"), // kappacode_change

  get KAPPA_DISABLE_PROJECT_CONFIG() {
    return kiloTruthy("DISABLE_PROJECT_CONFIG")
  },
  get KAPPA_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("EXPERIMENTAL_REFERENCES")
  },
  get KAPPA_TUI_CONFIG() {
    return kiloEnv("TUI_CONFIG")
  },
  get KAPPA_CONFIG_DIR() {
    return kiloEnv("CONFIG_DIR")
  },
  get KAPPA_PURE() {
    return kiloTruthy("PURE")
  },
  get KAPPA_PERMISSION() {
    return kiloEnv("PERMISSION")
  },
  get KAPPA_PLUGIN_META_FILE() {
    return kiloEnv("PLUGIN_META_FILE")
  },
  get KAPPA_CLIENT() {
    return kiloEnv("CLIENT") ?? "cli"
  },
  // kappacode_change start
  get KAPPA_SESSION_RETRY_LIMIT() {
    return kiloNumber("SESSION_RETRY_LIMIT")
  },
  // kappacode_change end
}
