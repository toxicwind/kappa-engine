import { describe, expect, test } from "bun:test"
import { Effect, Exit, Fiber, Layer, Stream } from "effect"
import { Permission } from "@/permission"
import { CrossSpawnSpawner } from "@toxicwind/core/cross-spawn-spawner"
import { Database } from "@toxicwind/core/database/database"
import { LayerNode } from "@toxicwind/core/effect/layer-node"
import { SessionProjector } from "@toxicwind/core/session/projector"
import { Memory } from "@toxicwind/core/memory"
import { MemoryService } from "@kappacode/kappa-memory/effect/service"
import { BackgroundJob } from "@/background/job"
import { KappaSessions } from "@/kappa-sessions/kappa-sessions"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { provideTmpdirServer } from "../../fixture/fixture.ts"
import { testEffect } from "../../lib/effect.ts"
import { TestLLMServer } from "../../lib/llm-server.ts"
import { LLMQueue, node as LLMQueueNode } from "@/kappacode/session/llm/queue"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      SessionProjector.node,
      Session.node,
      SessionStatus.node,
      Permission.node,
      BackgroundJob.node,
      Database.node,
      CrossSpawnSpawner.node,
      LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
      Memory.node,
      LayerNode.make({ service: MemoryService.Service, layer: MemoryService.layer, deps: [] }),
      LLMQueueNode,
    ]),
    [[KappaSessions.node, KappaSessions.testLayer]],
  ),
)

function config(url: string) {
  return {
    model: "test/test-model",
    enabled_providers: ["test"],
    snapshot: false,
    subagent_depth: 3,
    permission: { "*": "allow" as const },
    provider: {
      test: {
        npm: "@ai-sdk/openai-compatible",
        models: { "test-model": { name: "Test", limit: { context: 100000, output: 10000 } } },
        options: { apiKey: "test-key", baseURL: url, maxConcurrency: 1 },
      },
    },
  }
}

// Faithful copy of the permit-holding shape in packages/cli/src/session/llm.ts
// (Stream.scoped + Stream.unwrap + Effect.acquireRelease around queue.acquire).
// The inner stream stands in for the LLM event stream produced by run().
const gatedStream = (queue: LLMQueue["Service"], inner: Stream.Stream<number, never, never>) =>
  Stream.scoped(
    Stream.unwrap(
      Effect.acquireRelease(queue.acquire("test"), () => queue.release("test")).pipe(
        Effect.map(() => inner),
      ),
    ),
  )

// Behavioral probe: true when a permit is free right now. A successful probe
// acquire is released immediately so the probe itself holds nothing.
const permitFree = (queue: LLMQueue["Service"]) =>
  Effect.gen(function* () {
    const exit = yield* queue.acquire("test").pipe(Effect.timeout("500 millis"), Effect.exit)
    if (Exit.isSuccess(exit)) {
      yield* queue.release("test")
      return true
    }
    return false
  })

describe("LLMQueue permit lifecycle through the llm.ts stream shape (cap 1)", () => {
  it.live("releases the permit after the stream runs to completion", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const out = yield* Stream.runCollect(gatedStream(queue, Stream.make(1, 2, 3)))
          expect([...out]).toEqual([1, 2, 3])
          expect(yield* permitFree(queue)).toBe(true)
        }),
      { config },
    ),
  )

  it.live("releases the permit when the stream run is interrupted mid-flight", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const hanging = Stream.fromEffect(Effect.never.pipe(Effect.as(1)))
          const fiber = yield* Stream.runCollect(gatedStream(queue, hanging)).pipe(Effect.forkChild)
          yield* Effect.sleep("100 millis")
          yield* Fiber.interrupt(fiber)
          expect(yield* permitFree(queue)).toBe(true)
        }),
      { config },
    ),
  )

  it.live("releases the permit when the stream loses a race", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const hanging = Stream.fromEffect(Effect.never.pipe(Effect.as(1)))
          yield* Effect.raceFirst(
            Stream.runCollect(gatedStream(queue, hanging)),
            Effect.succeed("fast winner"),
          )
          expect(yield* permitFree(queue)).toBe(true)
        }),
      { config },
    ),
  )

  it.live("releases the permit when only the first element is taken", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const out = yield* Stream.runCollect(gatedStream(queue, Stream.make(1, 2, 3)).pipe(Stream.take(1)))
          expect([...out]).toEqual([1])
          expect(yield* permitFree(queue)).toBe(true)
        }),
      { config },
    ),
  )

  it.live("holds no permit when the stream is never run", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const _stream = gatedStream(queue, Stream.make(1, 2, 3))
          expect(yield* permitFree(queue)).toBe(true)
        }),
      { config },
    ),
  )

  it.live("releases the permit when the stream run times out", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const hanging = Stream.fromEffect(Effect.never.pipe(Effect.as(1)))
          const exit = yield* Stream.runCollect(gatedStream(queue, hanging)).pipe(
            Effect.timeout("100 millis"),
            Effect.exit,
          )
          expect(Exit.isFailure(exit)).toBe(true)
          expect(yield* permitFree(queue)).toBe(true)
        }),
      { config },
    ),
  )
})

// The abandonment mechanism: a stream run forked detached from every scope
// keeps its permit after the forking effect returns — only interrupting the
// fiber releases it. Kept in a single test: a detached fiber's release path
// reads the (per-test) config, so it must be interrupted while its own
// test's layer graph is still alive.
describe("LLMQueue permit leak via abandoned (detached) stream fiber", () => {
  it.live("a detached hanging stream holds its permit until its fiber is interrupted", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const hanging = Stream.fromEffect(Effect.never.pipe(Effect.as(1)))
          const fiber = yield* Stream.runCollect(gatedStream(queue, hanging)).pipe(Effect.forkDetach)
          yield* Effect.sleep("200 millis")
          // The forking effect is done; the detached fiber still runs.
          expect(yield* permitFree(queue)).toBe(false)
          yield* Fiber.interrupt(fiber)
          expect(yield* permitFree(queue)).toBe(true)
        }),
      { config },
    ),
  )
})
