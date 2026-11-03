import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { MessageID, SessionID } from "../../src/session/schema.ts"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { WorktreeTool } from "../../src/kappacode/tool/worktree.ts"
import { Worktree } from "../../src/worktree/index.ts"
import { Tool } from "../../src/tool/tool.ts"
import * as ToolJsonSchema from "../../src/tool/json-schema.ts"
import { Truncate } from "../../src/tool/truncate.ts"
import { Agent } from "../../src/agent/agent.ts"

const agent: Agent.Info = {
  name: "build",
  mode: "primary",
  permission: [],
  options: {},
}

const worktreeSvc: Worktree.Interface = {
  makeWorktreeInfo: () =>
    Effect.succeed({ name: "feature", directory: "/tmp/wt/feature", branch: "opencode/feature" }),
  createFromInfo: () => Effect.void,
  create: () => Effect.succeed({ name: "feature", directory: "/tmp/wt/feature", branch: "opencode/feature" }),
  list: () =>
    Effect.succeed([
      { name: "feature", directory: "/tmp/wt/feature", branch: "opencode/feature" },
      { name: "other", directory: "/tmp/wt/other" },
    ]),
  remove: () => Effect.succeed(true),
  reset: () => Effect.succeed(true),
}

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    AppNodeBuilder.build(Truncate.node),
    Layer.mock(Agent.Service, { get: () => Effect.succeed(agent) }),
    AppNodeBuilder.build(CrossSpawnSpawner.node),
    Layer.mock(Worktree.Service, worktreeSvc),
  ),
)

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "call_worktree",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [] as Tool.Context["messages"],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

async function init() {
  return runtime.runPromise(
    Effect.gen(function* () {
      const info = yield* WorktreeTool
      return yield* Tool.init(info)
    }),
  )
}

describe("worktree tool", () => {
  test("create returns the new worktree directory and branch", async () => {
    const tool = await init()
    const result = await runtime.runPromise(
      tool.execute({ action: "create", name: "feature" }, ctx),
    )
    expect(result.title).toContain("Created worktree")
    expect(result.output).toContain("/tmp/wt/feature")
    expect(result.output).toContain("opencode/feature")
    expect(result.metadata).toMatchObject({
      name: "feature",
      directory: "/tmp/wt/feature",
      branch: "opencode/feature",
    })
  })

  test("list returns every project worktree", async () => {
    const tool = await init()
    const result = await runtime.runPromise(tool.execute({ action: "list" }, ctx))
    expect(result.metadata).toMatchObject({
      worktrees: [
        { name: "feature", directory: "/tmp/wt/feature", branch: "opencode/feature" },
        { name: "other", directory: "/tmp/wt/other" },
      ],
    })
    expect(result.output).toContain("/tmp/wt/feature")
    expect(result.output).toContain("/tmp/wt/other")
  })

  test("remove deletes the named worktree", async () => {
    const tool = await init()
    const result = await runtime.runPromise(
      tool.execute({ action: "remove", directory: "/tmp/wt/feature" }, ctx),
    )
    expect(result.metadata).toMatchObject({ removed: true })
    expect(result.output).toContain("/tmp/wt/feature")
  })

  test("reset restores the named worktree to the default branch", async () => {
    const tool = await init()
    const result = await runtime.runPromise(
      tool.execute({ action: "reset", directory: "/tmp/wt/feature" }, ctx),
    )
    expect(result.metadata).toMatchObject({ reset: true })
    expect(result.output).toContain("/tmp/wt/feature")
  })

  test("uses an object-root input schema with create/list/remove/reset actions", async () => {
    const tool = await init()
    const schema = ToolJsonSchema.fromTool(tool)
    expect(schema.type).toBe("object")
    const action = schema.properties?.action
    expect(action && typeof action === "object" ? action.anyOf?.[0] : undefined).toEqual(
      expect.objectContaining({ enum: ["create", "list", "remove", "reset"] }),
    )
  })

  test("asks for worktree permission on every action", async () => {
    const tool = await init()
    const asks: { permission: string; patterns: string[] }[] = []
    const askCtx = { ...ctx, ask: (req: { permission: string; patterns: string[] }) => Effect.sync(() => asks.push(req)) }
    await runtime.runPromise(tool.execute({ action: "create", name: "feature" }, askCtx))
    expect(asks.length).toBe(1)
    expect(asks[0]!.permission).toBe("worktree")
    expect(asks[0]!.patterns).toContain("create")
  })
})