import { describe, expect, test } from "bun:test"
import { Effect, Exit, Fiber, Semaphore, Stream } from "effect"

// Minimal isolation: raw Semaphore + the exact llm.ts stream shape, no
// LLMQueue, no layers, no mock server. If this leaks, the composition
// itself (Stream.scoped + Stream.unwrap + Effect.acquireRelease) fails to
// release on interrupt in effect 4.0.6. If it does not leak, the bug is in
// the LLMQueue wrapper (entry/Ref/config).

const gated = (sem: Semaphore.Semaphore, inner: Stream.Stream<number, never, never>) =>
  Stream.scoped(
    Stream.unwrap(
      Effect.acquireRelease(sem.take(1), () => sem.release(1)).pipe(Effect.map(() => inner)),
    ),
  )

describe("raw semaphore + llm.ts stream shape", () => {
  test("release after completion", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sem = yield* Semaphore.make(1)
        const out = yield* Stream.runCollect(gated(sem, Stream.make(1, 2, 3)))
        expect([...out]).toEqual([1, 2, 3])
        expect(yield* sem.takeIfAvailable(1)).toBe(true)
      }),
    )
  })

  test("release after interrupt mid-flight", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sem = yield* Semaphore.make(1)
        const hanging = Stream.fromEffect(Effect.never.pipe(Effect.as(1)))
        // NOTE: effect 4.0.6 has no Effect.fork — it is Effect.forkChild.
        const fiber = yield* Stream.runCollect(gated(sem, hanging)).pipe(Effect.forkChild)
        yield* Effect.sleep("100 millis")
        // Prove the permit is actually held before interrupting.
        expect(yield* sem.takeIfAvailable(1)).toBe(false)
        yield* Fiber.interrupt(fiber)
        expect(yield* sem.takeIfAvailable(1)).toBe(true)
      }),
    )
  })

  test("release after race loss", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sem = yield* Semaphore.make(1)
        const hanging = Stream.fromEffect(Effect.never.pipe(Effect.as(1)))
        yield* Effect.raceFirst(Stream.runCollect(gated(sem, hanging)), Effect.succeed("win"))
        expect(yield* sem.takeIfAvailable(1)).toBe(true)
      }),
    )
  })

  test("release after detached fork + interrupt", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sem = yield* Semaphore.make(1)
        const hanging = Stream.fromEffect(Effect.never.pipe(Effect.as(1)))
        const fiber = yield* Stream.runCollect(gated(sem, hanging)).pipe(Effect.forkDetach)
        yield* Effect.sleep("100 millis")
        expect(yield* sem.takeIfAvailable(1)).toBe(false)
        yield* Fiber.interrupt(fiber)
        expect(yield* sem.takeIfAvailable(1)).toBe(true)
      }),
    )
  })

  test("release after timeout", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sem = yield* Semaphore.make(1)
        const hanging = Stream.fromEffect(Effect.never.pipe(Effect.as(1)))
        const exit = yield* Stream.runCollect(gated(sem, hanging)).pipe(
          Effect.timeout("100 millis"),
          Effect.exit,
        )
        expect(Exit.isFailure(exit)).toBe(true)
        expect(yield* sem.takeIfAvailable(1)).toBe(true)
      }),
    )
  })
})
