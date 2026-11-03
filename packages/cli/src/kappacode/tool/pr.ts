import { Effect, Schema } from "effect"
import { Tool } from "@/tool/tool"
import * as ToolJsonSchema from "@/tool/json-schema"
import { enabled as prEnabled, readSessionPrLink } from "@/kappa-sessions/pr-link"

const Status = Schema.Struct({
  action: Schema.Literal("status"),
})

export const Params = Schema.Union([Status])

const WireParams = Schema.Struct({
  action: Schema.NullOr(Schema.Literals(["status"])).annotate({
    description: "Show which pull request the current session is linked to.",
  }),
})

type Meta = { ok: boolean; platform?: string; prNumber?: number; prUrl?: string }

export const PrTool = Tool.define<typeof Params, Meta, never, "pr">(
  "pr",
  Effect.succeed({
    description:
      "Show which pull request the current session is linked to. Use status to see the linked PR number, platform, and URL. " +
      "To link a session to a PR, use the separate link_pr tool.",
    parameters: Params,
    jsonSchema: ToolJsonSchema.fromSchema(WireParams),
    execute: (params, ctx) =>
      Effect.gen(function* () {
        yield* ctx.ask({ permission: "pr", patterns: [params.action], always: [params.action], metadata: {} })
        if (params.action === "status") {
          if (!prEnabled()) {
            return {
              title: "PR linking unavailable",
              output: "Session PR linking is only available in CLI backends.",
              metadata: { ok: false },
            }
          }
          const record = yield* Effect.tryPromise(() => readSessionPrLink(ctx.sessionID)).pipe(
            Effect.catch(() => Effect.succeed(undefined)),
          )
          if (!record) {
            return {
              title: "No PR linked",
              output: "This session is not linked to any pull request.",
              metadata: { ok: false },
            }
          }
          return {
            title: `Linked PR #${record.link.prNumber}`,
            output: `This session is linked to ${record.link.prUrl} (${record.link.platform}).`,
            metadata: {
              ok: true,
              platform: record.link.platform,
              prNumber: record.link.prNumber,
              prUrl: record.link.prUrl,
            },
          }
        }
        return {
          title: "No PR linked",
          output: "This session is not linked to any pull request.",
          metadata: { ok: false },
        }
      }),
  }),
)