import { describe, expect, test } from "bun:test"
import { Effect, Fiber, Semaphore, Stream } from "effect"

// Diagnostic: the production llm.ts shape nests TWO Stream.unwraps — the
// outer acquireRelease maps to an inner Stream.unwrap(Effect.gen(...)).
// The single-unwrap shape releases on interrupt (llm-permit-minimal). Does
// the NESTED shape?

const nested = (sem: Semaphore.Semaphore, inner: Stream.Stream<number, Error, never>) =>
  Stream.scoped(
    Stream.unwrap(
      Effect.acquireRelease(sem.take(1), () => sem.release(1)).pipe(
        Effect.map(() =>
          Stream.unwrap(
            Effect.gen(function* () {
              const ctrl = yield* Effect.acquireRelease(
                Effect.sync(() => new AbortController()),
                (c) => Effect.sync(() => c.abort()),
              )
              return inner
            }),
          ),
        ),
      ),
    ),
  )

async function* neverResolving(): AsyncGenerator<number> {
  await new Promise(() => {})
  yield 1
}

describe("nested Stream.unwrap (llm.ts shape)", () => {
  test("release after interrupt mid-flight", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sem = yield* Semaphore.make(1)
        const hanging = Stream.fromAsyncIterable(neverResolving(), (e) =>
          e instanceof Error ? e : new Error(String(e)),
        )
        const fiber = yield* Stream.runDrain(nested(sem, hanging)).pipe(Effect.forkChild)
        yield* Effect.sleep("200 millis")
        expect(yield* sem.takeIfAvailable(1)).toBe(false)
        yield* Fiber.interrupt(fiber)
        expect(yield* sem.takeIfAvailable(1)).toBe(true)
      }),
    )
  })

  test("release after guard-failure race loss", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sem = yield* Semaphore.make(1)
        const guard = Effect.sleep("100 millis").pipe(Effect.andThen(Effect.fail(new Error("DisconnectedError"))))
        const outcome = yield* Effect.raceFirst(
          Stream.runDrain(
            nested(
              sem,
              Stream.fromAsyncIterable(neverResolving(), (e) =>
                e instanceof Error ? e : new Error(String(e)),
              ),
            ),
          ),
          guard,
        ).pipe(Effect.exit)
        expect(outcome._tag).toBe("Failure")
        expect(yield* sem.takeIfAvailable(1)).toBe(true)
      }),
    )
  })
})
