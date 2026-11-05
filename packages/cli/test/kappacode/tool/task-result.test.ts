import { describe, test, expect } from "bun:test"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { TaskResult } from "@/kappacode/tool/task-result"

// Real-contract tests: no mocks. Parts are built as plain objects matching the
// MessageV2.TextPart shape (type/text/synthetic/ignored).

type AnyMessage = SessionV1.WithParts

const text = (t: string, o: Record<string, unknown> = {}) => ({ type: "text", text: t, ...o })
const msg = (role: string, parts: unknown[], id = "m1") =>
  ({ info: { role, id }, parts }) as unknown as AnyMessage

describe("TaskResult.pickText", () => {
  test("returns the last non-synthetic non-empty text part", () => {
    const parts = [text("marker", { synthetic: true }), text("first"), text("final")]
    expect(TaskResult.pickText(parts as never)).toBe("final")
  })

  test("returns empty string when every part is synthetic or empty", () => {
    const parts = [text("marker", { synthetic: true }), text("")]
    expect(TaskResult.pickText(parts as never)).toBe("")
  })
})

describe("TaskResult.extract", () => {
  test("prefers the latest message's text", () => {
    const recent = [msg("assistant", [text("earlier")], "m1"), msg("assistant", [text("final report")], "m2")]
    expect(TaskResult.extract(recent.at(-1) as AnyMessage | undefined, recent as AnyMessage[])).toBe("final report")
  })

  test("walks back to an earlier assistant message when the latest carries no text (reasoning-budget starvation)", () => {
    const starved = msg("assistant", [text("")], "m3") // finish=length, empty content
    const recent = [msg("assistant", [text("the actual report")], "m2"), starved]
    expect(TaskResult.extract(starved as AnyMessage, recent as AnyMessage[])).toBe("the actual report")
  })

  test("returns empty when no assistant message carries text", () => {
    const recent = [msg("assistant", [text("", { synthetic: true })], "m1")]
    expect(TaskResult.extract(recent.at(-1) as AnyMessage | undefined, recent as AnyMessage[])).toBe("")
  })
})

describe("TaskResult.orDiagnostic", () => {
  test("passes through non-empty text unchanged", () => {
    expect(TaskResult.orDiagnostic("ses_1", "general", "report")).toBe("report")
  })

  test("empty text becomes a NON-EMPTY diagnostic naming the resumable session", () => {
    const out = TaskResult.orDiagnostic("ses_abc", "general", "")
    expect(out.length).toBeGreaterThan(0)
    expect(out).toContain("ses_abc")
    expect(out).toContain("task_id=\"ses_abc\"")
  })
})
