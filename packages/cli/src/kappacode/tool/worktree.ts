import { Effect, Schema } from "effect"
import { Tool } from "@/tool/tool"
import * as ToolJsonSchema from "@/tool/json-schema"
import { Worktree } from "@/worktree/index"

const Create = Schema.Struct({
  action: Schema.Literal("create"),
  name: Schema.optional(Schema.NullOr(Schema.String)).annotate({
    description: "Optional name for the worktree. Defaults to a generated slug.",
  }),
})

const List = Schema.Struct({
  action: Schema.Literal("list"),
})

const Remove = Schema.Struct({
  action: Schema.Literal("remove"),
  directory: Schema.String.annotate({
    description: "Directory of the worktree to remove (from a prior list or create).",
  }),
})

const Reset = Schema.Struct({
  action: Schema.Literal("reset"),
  directory: Schema.String.annotate({
    description: "Directory of the worktree to reset to the default branch.",
  }),
})

export const Params = Schema.Union([Create, List, Remove, Reset])

// Anthropic rejects a top-level anyOf/oneOf/allOf, so the advertised schema has to
// stay one flat object while Params keeps the real per-operation validation. Every
// field is nullable so strict structured-output providers (OpenAI Responses) can
// supply null for the fields that don't belong to the chosen action.
const WireParams = Schema.Struct({
  action: Schema.NullOr(Schema.Literals(["create", "list", "remove", "reset"])).annotate({
    description: "The worktree operation to perform. Use list first to discover existing worktrees.",
  }),
  name: Schema.NullOr(Schema.String).annotate({
    description: "For create: an optional name for the worktree. Defaults to a generated slug. Send null otherwise.",
  }),
  directory: Schema.NullOr(Schema.String).annotate({
    description: "For remove and reset: the worktree directory from a prior list or create. Send null otherwise.",
  }),
})

type CreateMeta = { name: string; directory: string; branch?: string }
type ListMeta = { worktrees: { name: string; directory: string; branch?: string }[] }
type RemoveMeta = { removed: boolean }
type ResetMeta = { reset: boolean }

export const WorktreeTool = Tool.define<
  typeof Params,
  CreateMeta | ListMeta | RemoveMeta | ResetMeta,
  Worktree.Service,
  "worktree"
>(
  "worktree",
  Effect.gen(function* () {
    const worktree = yield* Worktree.Service
    return {
      description:
        "Create, list, remove, or reset isolated git worktrees for the current project. " +
        "Use create to spin up an isolated worktree on its own branch without starting a managed Agent Manager session, " +
        "list to see existing worktrees, remove to delete one (and its branch), and reset to restore one to the default branch.",
      parameters: Params,
      jsonSchema: ToolJsonSchema.fromSchema(WireParams),
      execute: (params, ctx) =>
        Effect.gen(function* () {
          yield* ctx.ask({ permission: "worktree", patterns: [params.action], always: [params.action], metadata: {} })
          if (params.action === "create") {
            const info = yield* worktree.makeWorktreeInfo({ name: params.name?.trim() || undefined })
            yield* worktree.createFromInfo(info)
            return {
              title: `Created worktree ${info.name}`,
              output: `Created worktree ${info.name} at ${info.directory}${info.branch ? ` on branch ${info.branch}` : ""}.`,
              metadata: { name: info.name, directory: info.directory, ...(info.branch ? { branch: info.branch } : {}) },
            }
          }
          if (params.action === "list") {
            const list = yield* worktree.list()
            return {
              title: "Project worktrees",
              output:
                list.length === 0
                  ? "No worktrees found."
                  : list.map((w) => `${w.name}${w.branch ? ` (${w.branch})` : ""}  ${w.directory}`).join("\n"),
              metadata: { worktrees: list },
            }
          }
          if (params.action === "remove") {
            yield* worktree.remove({ directory: params.directory })
            return {
              title: "Worktree removed",
              output: `Removed worktree at ${params.directory}.`,
              metadata: { removed: true },
            }
          }
          yield* worktree.reset({ directory: params.directory })
          return {
            title: "Worktree reset",
            output: `Reset worktree at ${params.directory} to the default branch.`,
            metadata: { reset: true },
          }
        }),
    }
  }),
)