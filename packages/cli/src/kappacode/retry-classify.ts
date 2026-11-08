// retry-classify.ts — error taxonomy + structured retry decision (F6, 2026-11-08).
// Overload and quota-exhaustion are DIFFERENT failure classes with OPPOSITE
// cures. Only transient classes retry; quota/spend/blocked send ZERO requests.
// Kappa-owned (lives under src/kappacode/), no kappacode_change markers needed.

export type ErrorClass =
  | "transient-overload" // 429/503 with real upstream overload semantics -> retry
  | "rate-limit-minute" // 429 with Retry-After <= 60s -> retry honoring Retry-After
  | "quota-daily" // daily/quota window exhausted -> zero requests until reset
  | "spend-cap" // 402 / billing cap -> zero requests
  | "account-blocked" // 401/403 on a credential -> evict that credential
  | "provider-incident" // 5xx burst -> breaker open, same-tier fallback only
  | "concurrency-shed" // local 429, no provider headers -> 5s cap
  | "unknown"

export interface Classified {
  class: ErrorClass
  retry: boolean
  retryAfterMs?: number
  resetAtMs?: number
  reason: string
}

const SHED_CAP_MS = 5_000
const MINUTE_CAP_MS = 60_000

export function classify(input: {
  status?: number
  headers?: Record<string, string>
  body?: string
  message?: string
  providerRateLimitHeaders: boolean
  nowMs?: number
}): Classified {
  const now = input.nowMs ?? Date.now()
  const headers = input.headers ?? {}
  const raMs = parseRetryAfter(headers)

  if (input.status === 402) {
    return { class: "spend-cap", retry: false, reason: "402 billing cap — no request will succeed" }
  }
  if (input.status === 401 || input.status === 403) {
    return { class: "account-blocked", retry: false, reason: "credential rejected — evict credential" }
  }
  if (input.status === 429 || /quota|exhausted/i.test(input.body ?? "")) {
    if (/quota|exhausted|daily/i.test(`${input.body ?? ""} ${input.message ?? ""}`)) {
      return {
        class: "quota-daily",
        retry: false,
        resetAtMs: raMs === undefined ? undefined : now + raMs,
        reason: "quota window exhausted — zero retries until reset",
      }
    }
    if (!input.providerRateLimitHeaders) {
      return {
        class: "concurrency-shed",
        retry: true,
        retryAfterMs: Math.min(raMs ?? SHED_CAP_MS, SHED_CAP_MS),
        reason: "local concurrency shed — 5s cap",
      }
    }
    if (raMs !== undefined && raMs <= MINUTE_CAP_MS) {
      return { class: "rate-limit-minute", retry: true, retryAfterMs: raMs, reason: "per-minute limit — honor Retry-After" }
    }
    return {
      class: "transient-overload",
      retry: true,
      retryAfterMs: raMs === undefined ? undefined : Math.min(raMs, MINUTE_CAP_MS),
      reason: "transient overload — bounded Retry-After",
    }
  }
  if (input.status !== undefined && input.status >= 500) {
    return { class: "provider-incident", retry: true, reason: "5xx burst — breaker open, same-tier fallback only" }
  }
  return { class: "unknown", retry: false, reason: `unclassified (${input.status ?? "no status"}) — do not retry blind` }
}

export function parseRetryAfter(headers: Record<string, string>): number | undefined {
  const ms = headers["retry-after-ms"]
  if (ms) {
    const n = Number.parseFloat(ms)
    if (!Number.isNaN(n)) return Math.max(0, n)
  }
  const sec = headers["retry-after"]
  if (sec) {
    const n = Number.parseFloat(sec)
    if (!Number.isNaN(n)) return Math.max(0, Math.ceil(n * 1000))
    const d = Date.parse(sec) - Date.now()
    if (!Number.isNaN(d) && d > 0) return d
  }
  return undefined
}