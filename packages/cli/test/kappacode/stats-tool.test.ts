import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Truncate } from "../../src/tool/truncate.ts"
import { Agent } from "../../src/agent/agent.ts"
import { Session } from "../../src/session/session.ts"
import { SessionStatus } from "../../src/session/status.ts"
import { BackgroundJob } from "../../src/background/job.ts"
import { Config } from "../../src/config/config.ts"
import { RuntimeFlags } from "../../src/effect/runtime-flags.ts"
import { Permission } from "../../src/permission/index.ts"
import { ToolRegistry } from "../../src/tool/registry.ts"
import { AppNodeBuilderV1 } from "../../src/effect/app-node-builder-v1.ts"
import { StatsTool } from "../../src/kappacode/tool/stats.ts"
import { Tool } from "../../src/tool/tool.ts"
import * as ToolJsonSchema from "../../src/tool/json-schema.ts"
import { MessageID, SessionID } from "../../src/session/schema.ts"
import { testEffect } from "../lib/effect.ts"

const it = testEffect(
  AppNodeBuilderV1.build(
    LayerNode.group([
      ToolRegistry.node,
      SessionProjector.node,
      Permission.node,
      Session.node,
      SessionStatus.node,
      BackgroundJob.node,
      Agent.node,
      Config.node,
      RuntimeFlags.node,
      Database.node,
      Truncate.node,
      CrossSpawnSpawner.node,
    ]),
  ),
)

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "call_stats",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [] as Tool.Context["messages"],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

describe("stats tool", () => {
  it.instance("reports token and cost usage", () =>
    Effect.gen(function* () {
      const tool = yield* Tool.init(yield* StatsTool)
      const result = yield* tool.execute({}, ctx)
      expect(result.title).toContain("Stats")
      expect(result.metadata).toHaveProperty("totalSessions")
      expect(result.metadata).toHaveProperty("totalTokens")
    }),
  )

  it.effect("uses an object-root input schema", () =>
    Effect.gen(function* () {
      const tool = yield* Tool.init(yield* StatsTool)
      const schema = ToolJsonSchema.fromTool(tool)
      expect(schema.type).toBe("object")
    }),
  )
})