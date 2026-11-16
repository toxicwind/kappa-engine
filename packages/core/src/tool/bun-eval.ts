export * as BunEvalTool from "./bun-eval"

import path from "path"
import { Duration, Effect, Layer, Schema } from "effect"
import { ChildProcess } from "effect/process"
import { ToolFailure } from "@toxicwind/llm"
import { Config } from "../config"
import { BackgroundJob } from "../background-job"
import { makeLocationNode } from "../effect/app-node"
import { FSUtil } from "../fs-util"
import { LocationMutation } from "../location-mutation"
import { AppProcess } from "../process"
import { PermissionV2 } from "../permission"
import { PositiveInt } from "../schema"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "bun_eval"
export const DEFAULT_TIMEOUT_MS = 2 * 60 * 1_000
export const MAX_TIMEOUT_MS = 10 * 60 * 1_000
export const MAX_CAPTURE_BYTES = 1024 * 1024

export const Input = Schema.Struct({
  expression: Schema.String.annotate({
    description:
      "Bun/JS/TS expression to evaluate (e.g. '1 + 2', 'await fetch(u).json()'). Prefer this over bash for computation, JSON, and fetch.",
  }),
  workdir: Schema.String.pipe(Schema.optional).annotate({
    description: "Working directory. Defaults to the active Location; relative paths resolve from that Location.",
  }),
  timeout: PositiveInt.check(Schema.isLessThanOrEqualTo(MAX_TIMEOUT_MS))
    .pipe(Schema.optional)
    .annotate({
      description: `Timeout in milliseconds. Defaults to ${DEFAULT_TIMEOUT_MS} and may not exceed ${MAX_TIMEOUT_MS}.`,
    }),
})

const StructuredOutput = Schema.Struct({
  exit: Schema.Number.pipe(Schema.optional),
  truncated: Schema.Boolean,
  timeout: Schema.Boolean.pipe(Schema.optional),
})

const Output = Schema.Struct({
  ...StructuredOutput.fields,
  output: Schema.String,
})

type Output = typeof Output.Type

const isTimeout = (error: AppProcess.AppProcessError) =>
  error.cause instanceof Error && error.cause.message === "Timed out"

const BACKGROUND_WAIT_SLACK_MS = 500

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const mutation = yield* LocationMutation.Service
    const fs = yield* FSUtil.Service
    const appProcess = yield* AppProcess.Service
    const permission = yield* PermissionV2.Service
    const jobs = yield* BackgroundJob.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description:
            "Evaluate a bun-native JS/TS expression (the Pens's default-to-bun eval lane). " +
            "Prefer this over bash for computation, JSON handling, and fetch — it avoids shell-quoting traps and runs typed JS/TS with async support. " +
            "The active Location is the default working directory.",
          input: Input,
          output: Output,
          structured: StructuredOutput,
          toStructuredOutput: ({ output }) => ({
            truncated: output.truncated,
            ...(output.exit === undefined ? {} : { exit: output.exit }),
            ...(output.timeout === undefined ? {} : { timeout: output.timeout }),
          }),
          toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
          execute: (input, context) =>
            Effect.gen(function* () {
              const source = {
                type: "tool" as const,
                messageID: context.assistantMessageID,
                callID: context.toolCallID,
              }
              const target = yield* mutation.resolve({ path: input.workdir ?? ".", kind: "directory" })
              const external = target.externalDirectory
              if (external)
                yield* permission.assert({
                  ...LocationMutation.externalDirectoryPermission(external),
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })
              yield* permission.assert({
                action: name,
                resources: [input.expression],
                save: [input.expression],
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })
              if ((yield* fs.stat(target.canonical)).type !== "Directory")
                return yield* Effect.fail(new Error(`Working directory is not a directory: ${target.canonical}`))

              const bin = process.env.BUN_EVAL_BIN ?? "bun-eval"
              const command = ChildProcess.make(bin, ["--json", input.expression], {
                cwd: target.canonical,
                stdin: "ignore",
                detached: process.platform !== "win32",
                forceKillAfter: Duration.seconds(3),
              })
              const timeout = input.timeout ?? DEFAULT_TIMEOUT_MS
              const job = yield* jobs.start({
                type: name,
                title: input.expression.slice(0, 80),
                run: Effect.gen(function* () {
                  const run = yield* appProcess
                    .run(command, {
                      combineOutput: true,
                      maxOutputBytes: MAX_CAPTURE_BYTES,
                    })
                    .pipe(
                      Effect.catchTag("AppProcessError", (error) =>
                        isTimeout(error) ? Effect.succeed(undefined) : Effect.fail(error),
                      ),
                    )
                  if (run === undefined) return ""
                  const notice = run.outputTruncated ? "\n[output capture truncated at the in-memory safety limit]" : ""
                  return `${run.output?.toString("utf8") || "(no output)"}${notice}\n[exit ${run.exitCode}]`
                }),
              })
              const waited = yield* jobs.wait({ id: job.id, timeout: timeout + BACKGROUND_WAIT_SLACK_MS })
              const info = waited.info
              if (!info || info.status === "running") {
                return {
                  output: `Expression exceeded timeout of ${timeout} ms and was AUTO-BACKGROUNDED as job ${job.id} (still running; output keeps streaming into the job).\nDeliver the result with: background-job wait { "id": "${job.id}" } — or cancel with: background-job cancel { "id": "${job.id}" }.`,
                  truncated: false,
                  timeout: false,
                }
              }
              const completed = info.status !== "error"
              const output = info.output || info.error || "(no output)"
              const failed = info.status === "error" ? ` (job failed: ${info.error ?? "unknown"})` : ""
              return {
                exit: completed
                  ? info.output?.match(/\[exit (\d+)\]$/)?.[1]
                    ? Number(info.output.match(/\[exit (\d+)\]$/)?.[1])
                    : 0
                  : 1,
                output: `${output}${failed}`,
                truncated: false,
              }
            }).pipe(Effect.mapError(() => new ToolFailure({ message: `Unable to evaluate expression: ${input.expression}` }))),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/bun-eval",
  layer,
  deps: [
    ToolRegistry.node,
    LocationMutation.node,
    FSUtil.node,
    AppProcess.node,
    Config.node,
    PermissionV2.node,
    BackgroundJob.node,
  ],
})