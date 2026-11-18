import { Effect, Deferred } from "effect"
import type { BackgroundJob } from "@/background/job"
import type { SessionID } from "@/session/schema"

export namespace KappaBackgrounder {
  /** Kairos ceiling: the default deadline for foreground subagent turns. */
  export const KAIROS_CEILING_MS = 4_000

  /**
   * Resolve the effective deadline (in ms) for a foreground subagent.
   * Returns the kairos ceiling when flagValue is null/undefined/non-positive.
   */
  export function getDeadline(flagValue?: number | undefined): number {
    if (flagValue == null || flagValue <= 0) return KAIROS_CEILING_MS
    return flagValue
  }

  export type Settlement =
    | { readonly type: "settled"; info: { status?: string; output?: string; error?: string } }
    | { readonly type: "promoted"; info: { background: true; jobId: SessionID } }

  export type RaceInput = {
    readonly jobs: Pick<BackgroundJob.Interface, "start" | "wait" | "promote" | "get" | "cancel">
    readonly id: SessionID
    readonly run: Effect.Effect<string>
    readonly deadline: number
    readonly steerSignal?: AbortSignal
    readonly onPromote?: Effect.Effect<void>
    readonly onCancel?: Effect.Effect<void>
  }

  export function raceWithSteering(input: RaceInput): Effect.Effect<Settlement> {
    const { jobs, id, deadline, steerSignal, onPromote } = input

    const settled = jobs.wait({ id }).pipe(
      Effect.map(
        (w: { info?: { status?: string; output?: string; error?: string; metadata?: { background?: boolean } } }) => {
          if (!w.info) return { kind: "settled" as const, info: { status: "running" } }
          const info = w.info
          if (info.status === "error")
            return { kind: "settled" as const, info: { status: info.status, error: info.error } }
          if (info.status === "cancelled") return { kind: "settled" as const, info: { status: "cancelled" } }
          if (info.metadata?.background === true)
            return { kind: "settled" as const, info: { status: "completed", output: info.output } }
          return { kind: "settled" as const, info: { status: info.status, output: info.output } }
        },
      ),
    )

    const timedOut = Effect.sleep(`${deadline} millis`).pipe(Effect.as({ kind: "timeout" as const }))

    const settledOrTimeout = settled.pipe(Effect.raceFirst(timedOut))

    const settledOrTimeoutOrSteer: Effect.Effect<
      { kind: "settled" | "timeout"; info?: unknown } | { kind: "steer" },
      never,
      never
    > = steerSignal
      // forkScoped below needs a Scope; Effect.scoped discharges it so this
      // stays Effect<..., never, never>. The scope closes when the race
      // resolves, interrupting the forked settler — its result is already
      // delivered via settledDeferred by then (or the steer won).
      ? Effect.scoped(Effect.gen(function* () {
          const steerDeferred = yield* Deferred.make<true>()
          const settledDeferred = yield* Deferred.make<Effect.Success<typeof settledOrTimeout>>()

          const sub = () => {
            // Deferred.succeed is a lazy Effect: it must be RUN, not discarded.
            void Effect.runPromise(Deferred.succeed(steerDeferred, true).pipe(Effect.ignore))
          }

          steerSignal.addEventListener("abort", sub, { once: true })

          // NOTE: forkScoped is an Effect — it must be yielded, not voided.
          // The old `void ... forkScoped` never ran, so settledDeferred was
          // never completed and any await on it hung forever.
          yield* settledOrTimeout.pipe(
            Effect.tap((result) => Deferred.succeed(settledDeferred, result).pipe(Effect.ignore)),
            Effect.forkScoped,
          )

          const cleanup = Effect.sync(() => steerSignal.removeEventListener("abort", sub))

          // Race the steer signal against the job settlement: whichever fires
          // first wins. The old code awaited the steer with a 1ms timeout and
          // returned a bare { kind: "settled" } with no info, dropping the job's
          // real result (status/output/error) — every foreground task reported
          // "completed" with empty output the moment the steer signal existed.
          const steerWinner = yield* Effect.gen(function* () {
            if (steerSignal.aborted) return { kind: "steer" as const }
            return yield* Effect.raceFirst(
              Deferred.await(steerDeferred).pipe(Effect.as({ kind: "steer" as const })),
              Deferred.await(settledDeferred),
            )
          }).pipe(Effect.tap(() => cleanup))

          return steerWinner
        }))
      : settledOrTimeout

    return Effect.gen(function* () {
      const result = yield* settledOrTimeoutOrSteer

      if (result.kind === "steer") {
        yield* jobs.promote(id).pipe(Effect.orDie)
        yield* onPromote ?? Effect.void
        return {
          type: "promoted",
          info: { background: true, jobId: id },
        } as Settlement
      }

      const settledOrTimeoutResult = result as { kind: "settled" | "timeout"; info?: unknown }

      if (settledOrTimeoutResult.kind === "timeout") {
        const current = yield* jobs.get(id).pipe(Effect.orDie)
        if (current?.status === "error")
          return {
            type: "settled",
            info: { status: "error", error: current.error },
          } as Settlement
        if (current?.status === "cancelled") return { type: "settled", info: { status: "cancelled" } } as Settlement
        if (current?.metadata?.background === true || current?.status === "completed") {
          yield* onPromote ?? Effect.void
          return {
            type: "promoted",
            info: { background: true, jobId: id },
          } as Settlement
        }
        const promoted = yield* jobs.promote(id).pipe(Effect.orDie)
        return {
          type: "promoted",
          info: { background: true, jobId: promoted?.id ?? id },
        } as Settlement
      }

      const info = settledOrTimeoutResult.info as {
        status?: string
        output?: string
        error?: string
        metadata?: { background?: boolean }
      }

      if (info?.metadata?.background === true)
        return {
          type: "promoted",
          info: { background: true, jobId: id },
        } as Settlement

      if (info?.status === "error")
        return {
          type: "settled",
          info: { status: info.status, error: info.error },
        } as Settlement

      if (info?.status === "cancelled") return { type: "settled", info: { status: "cancelled" } } as Settlement

      return {
        type: "settled",
        info: { status: info?.status, output: info?.output },
      } as Settlement
    })
  }
}
