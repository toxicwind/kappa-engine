import { describe, expect, test } from "bun:test"
import { classify, parseRetryAfter } from "@/kappacode/retry-classify"

// F6 (2026-11-08, Thread 3): overload and quota-exhaustion are DIFFERENT
// failure classes with OPPOSITE cures. Overload retries (bounded); quota
// sends ZERO requests until reset. The old code keyed off status 429/503
// alone, so a 1d14h quota reset looked identical to a 22s overload shed and
// the router kept retrying something that could never succeed.
describe("classify", () => {
	test("quota exhaustion -> zero retries + reset time", () => {
		const c = classify({ status: 429, body: "daily quota exhausted", headers: { "retry-after": "129600" }, providerRateLimitHeaders: true, nowMs: 1000 })
		expect(c.class).toBe("quota-daily")
		expect(c.retry).toBe(false)
		expect(c.resetAtMs).toBe(1000 + 129_600_000)
	})

	test("402 spend cap -> zero retries", () => {
		const c = classify({ status: 402, providerRateLimitHeaders: false })
		expect(c.class).toBe("spend-cap")
		expect(c.retry).toBe(false)
	})

	test("401/403 evicts credential, no retry", () => {
		expect(classify({ status: 401, providerRateLimitHeaders: false }).retry).toBe(false)
		expect(classify({ status: 403, providerRateLimitHeaders: false }).retry).toBe(false)
	})

	test("local shed (no provider headers) -> 5s cap", () => {
		const c = classify({ status: 429, providerRateLimitHeaders: false, headers: { "retry-after": "22" } })
		expect(c.class).toBe("concurrency-shed")
		expect(c.retryAfterMs).toBe(5000)
	})

	test("per-minute limit honors Retry-After <= 60s", () => {
		const c = classify({ status: 429, providerRateLimitHeaders: true, headers: { "retry-after": "30" } })
		expect(c.class).toBe("rate-limit-minute")
		expect(c.retryAfterMs).toBe(30000)
	})

	test("5xx burst -> provider-incident, retry (breaker decides how)", () => {
		expect(classify({ status: 503, providerRateLimitHeaders: false }).class).toBe("provider-incident")
	})

	test("unknown status -> no blind retry", () => {
		expect(classify({ status: 418, providerRateLimitHeaders: false }).retry).toBe(false)
	})
})

describe("parseRetryAfter", () => {
	test("ms wins over seconds", () => {
		expect(parseRetryAfter({ "retry-after-ms": "1500", "retry-after": "9" })).toBe(1500)
	})
	test("http-date parsed", () => {
		const d = new Date(Date.now() + 20000).toUTCString()
		const ms = parseRetryAfter({ "retry-after": d })!
		expect(ms).toBeGreaterThan(18000)
	})
	test("missing -> undefined", () => {
		expect(parseRetryAfter({})).toBeUndefined()
	})
})