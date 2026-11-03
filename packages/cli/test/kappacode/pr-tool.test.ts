import { describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { MessageID, SessionID } from "../../src/session/schema.ts"
import { PrTool } from "../../src/kappacode/tool/pr.ts"
import { Tool } from "../../src/tool/tool.ts"
import { Truncate } from "../../src/tool/truncate.ts"
import { Agent } from "../../src/agent/agent.ts"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import * as ToolJsonSchema from "../../src/tool/json-schema.ts"

const agent: Agent.Info = {
  name: "build",
  mode: "primary",
  permission: [],
  options: {},
}

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    AppNodeBuilder.build(Truncate.node),
    Layer.mock(Agent.Service, { get: () => Effect.succeed(agent) }),
  ),
)

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "call_pr",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [] as Tool.Context["messages"],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

async function init() {
  return runtime.runPromise(
    Effect.gen(function* () {
      const info = yield* PrTool
      return yield* Tool.init(info)
    }),
  )
}

describe("pr tool", () => {
  test("status reports the session's linked pull request", async () => {
    const tool = await init()
    const result = await runtime.runPromise(tool.execute({ action: "status" }, ctx))
    expect(result.title).toContain("PR")
    expect(result.metadata).toHaveProperty("ok")
  })

  test("uses an object-root input schema with a status action", async () => {
    const tool = await init()
    const schema = ToolJsonSchema.fromTool(tool)
    expect(schema.type).toBe("object")
    const action = schema.properties?.action
    expect(action && typeof action === "object" ? action.anyOf?.[0] : undefined).toEqual(
      expect.objectContaining({ enum: ["status"] }),
    )
  })
})