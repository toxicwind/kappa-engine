import type { MessageV2 } from "@/session/message-v2"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { resumeHint } from "../task-resume"

type AnyMessage = SessionV1.WithParts

/**
 * Task-result extraction for the task tool boundary (#13469 sibling).
 *
 * Contract: the parent session receives the subagent's report through THIS
 * extraction. It must never return an empty string silently — an empty
 * <task_result> leaves the parent blind. The final assistant message can carry
 * no text (reasoning-budget starvation: finish=length, empty content — estate
 * anomaly #1) while an earlier message holds the actual report, so the walk
 * back over recent messages is part of the contract, not a heuristic.
 */
export namespace TaskResult {
  /** Last non-synthetic, non-ignored, non-empty text part in one message. */
  export const pickText = (parts: MessageV2.Part[]): string =>
    parts
      .filter((item): item is MessageV2.TextPart => item.type === "text")
      .findLast((item) => !item.synthetic && !item.ignored && item.text.length > 0)?.text ?? ""

  /**
   * Extract the report: the latest message's text first, then the most recent
   * earlier assistant message that carries text.
   */
  export const extract = (latest: AnyMessage | undefined, recent: AnyMessage[]): string => {
    const fromLatest = latest ? pickText(latest.parts) : ""
    if (fromLatest) return fromLatest
    const earlier = [...recent]
      .reverse()
      .slice(latest ? 1 : 0)
      .find((m) => m.info.role === "assistant" && pickText(m.parts).length > 0)
    return earlier ? pickText(earlier.parts) : ""
  }

  /**
   * Fail-loud wrapper: empty text becomes a diagnostic that names the resumable
   * session (resumeHint pattern from kappacode/task-resume.ts) so the parent
   * can always continue the subagent.
   */
  export const orDiagnostic = (sessionID: string, agentName: string, text: string): string =>
    text ||
    [
      `Subagent ${sessionID} (${agentName}) completed with NO text output`,
      `(likely reasoning-budget starvation: finish=length, empty content).`,
      resumeHint(sessionID),
    ].join(" ")
}
