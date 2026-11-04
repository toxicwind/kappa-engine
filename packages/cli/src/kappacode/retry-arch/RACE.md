# Retry / Routing as Structural Scheduling State — RACE.md

> **Directive (2026-11-04):** failure is not an exception to catch — it is a
> structural state of the scheduling queue. Kappa's `src/session/retry.ts`
> currently treats provider overload as a catch-and-backoff loop. This doc
> races 4 orthogonal architectural routes and declares a winner.

## Why this matters

The current retry logic (`src/session/retry.ts`) has real defects:
- A concurrency shed (rhodochrosite/Thresher 429 with no provider rate-limit
  header) was honored as a 22s+ retry-after, stalling the agent.
- Flat-string model routing (`hodos/qwen3.6-35b`, a fabricated `qwen/qwen3.6-plus`)
  let invalid identities through the boundary and dropped to fallbacks.
- "Provider is overloaded" was a dead-end message with no provider or action.

The architect's framing: model identity is a product type
`(ParentRouter × Provider × ModelCore(Variant))`, not a flat string; a rate
limit is a scheduling state, not an exception.

## The 4 orthogonal routes

### Route 1 — Actor-model eviction (Erlang/OTP, Akka/Pekko)
A supervisor treats a rate-limited provider as a quarantined actor. On a 429/503
cluster it **evicts** the actor from the active pool, drains its mailbox, and
**spawns a fresh throttled instance** after a cooldown. No try/catch — the actor
"dies" and is resurrected. Backpressure is handled by the mailbox (bounded queue).
- **Fit:** strong isolation, per-provider lifecycle, natural resurrection.
- **Cost:** actor-runtime machinery; overkill for a single-process CLI.
- **Prior art:** Erlang OTP supervisor trees; Akka/Pekko supervision.

### Route 2 — Reactive backpressure (Reactive Streams)
When a pipeline is overwhelmed, propagate a signal upstream to **stop emitting**,
buffer, and on downstream-clear telemetry emit `request(n)` to resume, scaling
rate dynamically. The processing pipeline is paused into a buffering state.
- **Fit:** excellent for streaming LLM responses (SSE) under load.
- **Cost:** requires the whole pipeline to be pull-based; kappa's is push-based.
- **Prior art:** Reactive Streams spec (ReactiveX, Akka Streams, Project Reactor).

### Route 3 — Durable orchestrated eviction (Temporal/Ray)
Serialize the task state to disk, **evict it from the active executor** (zero
CPU/mem), set an internal timer, wake the fiber and resume exactly where it left
off after the cooldown. Rate limits are interceptable events, not exceptions.
- **Fit:** crash-safe, resumable, ideal for long agent turns.
- **Cost:** heavy — a workflow engine (Temporal/Ray) is a big dependency.
- **Prior art:** Temporal workflows; Ray task orchestration.

### Route 4 — Circuit-breaker + incremental token-bucket resurrection
Per-provider circuit breaker that **opens** on a failure cluster, then a
token-bucket-based recovery probe **re-arms** it at low priority after a
calculated backpressure duration. This is the classic resilience pattern and
the closest to what rhodochrosite already does (`circuit: half_open` observed
in the live `/v1/models` probe).
- **Fit:** low machinery, per-provider, matches rhodochrosite's existing
  circuit state, integrates with the existing `isConcurrencyShed` detection.
- **Cost:** needs the token-bucket re-arm probe; message still needs the
  provider name.

## Winner: Route 4 (circuit-breaker + token-bucket resurrection)

**Evidence:** rhodochrosite's live `/v1/models` already reports
`"circuit":"half_open"` per provider — the estate's router already speaks this
language. Route 4 is the only route that:
1. Reuses the existing `isConcurrencyShed` detection (already in retry.ts).
2. Matches rhodochrosite's circuit state (no new machinery).
3. Gives a concrete resurrection path (token-bucket re-arm probe at low
   priority) instead of a blind backoff loop.
4. Keeps the 5s shed-cap already landed in `retry.ts` (a local shed is not a
   real provider rate limit).

Routes 1–3 are documented for future work but rejected now: actor-runtime and
workflow-engine machinery are too heavy for a single-process CLI, and reactive
backpressure requires a pull-based pipeline kappa doesn't have.

## Already landed (2026-11-04)

- `retry.ts`: concurrency-shed delay capped to 5s (was honoring 22s+ retry-after).
- `retry.ts`: "Provider is overloaded" now names the provider + "retrying with
  backoff".
- TDD: 4 new shed-cap tests + 2 updated message-contract tests (65/65 pass).

## Follow-up (Route 4 full)

1. Per-provider circuit state (open/half-open/closed) keyed by provider.
2. Token-bucket re-arm probe: after a shed, schedule a low-priority probe that
   re-arms the provider when the bucket refills.
3. Model identity as a product type — reject flat-string identities at the
   boundary (kills the `hodos/qwen3.6-35b` / `qwen/qwen3.6-plus` class of bug).