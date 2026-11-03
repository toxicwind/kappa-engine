import { Effect, Schema } from "effect"
import { Tool } from "@/tool/tool"
import * as ToolJsonSchema from "@/tool/json-schema"
import { aggregateSessionStats } from "@/cli/cmd/stats"
import { Database } from "@opencode-ai/core/database/database"
import { Session } from "@/session/session"
import { InstanceState } from "@/effect/instance-state"

const Params = Schema.Struct({
  days: Schema.optional(Schema.NullOr(Schema.Int)).annotate({
    description: "Show stats for the last N days. Omit for all time.",
  }),
})

const WireParams = Schema.Struct({
  days: Schema.NullOr(Schema.Int).annotate({
    description: "Show stats for the last N days. Send null for all time.",
  }),
})

type Meta = {
  totalSessions: number
  totalMessages: number
  totalCost: number
  totalTokens: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
  days: number
  costPerDay: number
}

export const StatsTool = Tool.define<
  typeof Params,
  Meta,
  Database.Service | Session.Service,
  "stats"
>(
  "stats",
  Effect.gen(function* () {
    return {
      description:
        "Report token usage and cost statistics for the current project. Use to see how many sessions, messages, tokens, and how much cost has been spent. Optionally filter to the last N days.",
      parameters: Params,
      jsonSchema: ToolJsonSchema.fromSchema(WireParams),
      execute: (params, ctx) =>
        Effect.gen(function* () {
          yield* ctx.ask({ permission: "stats", patterns: ["*"], always: ["*"], metadata: {} })
          const instance = yield* InstanceState.context
          const stats = yield* aggregateSessionStats(params.days ?? undefined, "", instance.project)
          const meta: Meta = {
            totalSessions: stats.totalSessions,
            totalMessages: stats.totalMessages,
            totalCost: stats.totalCost,
            totalTokens: stats.totalTokens,
            days: stats.days,
            costPerDay: stats.costPerDay,
          }
          return {
            title: `Stats: ${stats.totalSessions} sessions`,
            output: [
              `Sessions: ${stats.totalSessions}`,
              `Messages: ${stats.totalMessages}`,
              `Days: ${stats.days}`,
              `Total cost: $${stats.totalCost.toFixed(2)}`,
              `Avg cost/day: $${stats.costPerDay.toFixed(2)}`,
              `Input tokens: ${stats.totalTokens.input}`,
              `Output tokens: ${stats.totalTokens.output}`,
              `Reasoning tokens: ${stats.totalTokens.reasoning}`,
              `Cache read: ${stats.totalTokens.cache.read}`,
              `Cache write: ${stats.totalTokens.cache.write}`,
            ].join("\n"),
            metadata: meta,
          }
        }),
    }
  }),
)