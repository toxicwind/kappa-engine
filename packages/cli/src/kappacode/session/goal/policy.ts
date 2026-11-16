import { Effect, Exit } from "effect"
import type { SessionV1 } from "@toxicwind/core/v1/session"
import type { PromptInput } from "@/session/prompt"
import type { MessageID, SessionID } from "@/session/schema"
import { KappaSessionPromptQueue } from "../prompt-queue.ts"
import { GoalState } from "./state.ts"

export namespace GoalPolicy {
  // A curbed goal may only arm a wait. `background_process` belongs here with the
  // two time tools: a non-terminal start or a monitor arms a process wait, so
  // the gate agrees with the instruction text that names it as a valid first call.
  const WAIT = new Set(["schedule_wakeup", "cron_create", "background_process"])
  export type Report = { status: "complete" | "blocked"; reason: string }
  export type Owner = {
    root: SessionID
    report: (id: MessageID, report: Report) => boolean
    input: (input: PromptInput) => PromptInput
    fail: () => void
    current: () => boolean
  }
  const owners = new Map<MessageID, Owner>()

  export function track(id: MessageID, owner: Owner) {
    owners.set(id, owner)
  }

  export function release(id: MessageID, owner: Owner) {
    if (owners.get(id) === owner) owners.delete(id)
  }

  // Find the live goal owner for a session. The owner is tracked under many
  // message ids (the goal parent plus every prompt it served), and the prompt
  // queue's active base can drift to an untracked id after a resume/follow-up.
  // A session-scoped scan (root match + still current) is the source of truth,
  // so the root worker can always report its own goal.
  function ownerFor(id: SessionID) {
    const base = KappaSessionPromptQueue.active(id)
    const direct = base ? owners.get(base) : undefined
    if (direct?.root === id && direct.current()) return direct
    for (const owner of owners.values()) {
      if (owner.root === id && owner.current()) return owner
    }
    return undefined
  }

  export function available(id: SessionID, tool: string) {
    if (tool === "goal_report") {
      // The working model inside a goal turn must be able to report completion
      // or a blocker. Allow when this session is the active goal owner's root,
      // OR when this session is the current working model of an active goal.
      const owner = ownerFor(id)
      if (owner) return owner.root === id && owner.current()
      // Fall back: if there is any active goal for this session family, allow
      // the report so a delegated/working model can settle it.
      return GoalState.active(id)
    }
    if (GoalState.curbed(id) && !WAIT.has(tool)) return false
    if (tool !== "question" && tool !== "goal") return true
    if (GoalState.hold(id)) return false
    const owner = ownerFor(id)
    // `goal` control (start/change/pause/clear/resume) must stay available to
    // the working model even while a goal is active, so it can `change` the
    // objective mid-flight. Only block a *second concurrent start* — the runner
    // already guards that with GoalState.active + the "already active" error.
    if (!owner) return true
    return true
  }

  export function report(id: SessionID, message: MessageID, report: Report) {
    const owner = ownerFor(id)
    return owner?.root === id && owner.current() && owner.report(message, report)
  }

  export function bind<E, R>(id: SessionID, prompt: (input: PromptInput) => Effect.Effect<SessionV1.WithParts, E, R>) {
    const owner = ownerFor(id)
    if (!owner) return prompt
    return (input: PromptInput) =>
      Effect.suspend(() => prompt(owner.input(input))).pipe(
        Effect.onExit((exit) =>
          Exit.isFailure(exit) || (exit.value.info.role === "assistant" && exit.value.info.error)
            ? Effect.sync(owner.fail)
            : Effect.void,
        ),
      )
  }
}
