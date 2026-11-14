import { describe, it, expect } from "bun:test"
import {
  obligationGuard,
  budgetGuard,
  type ObligationInput,
  type BudgetInput,
} from "@/kappacode/flail-gate"

/**
 * The flail gate already owns the run-scoped guards: a narration guard, an
 * error-loop brake, a pivot budget and a semantic brake. This adds the two
 * guards the constitution introduces, in the same Effect-flavored surface and
 * the same `GuardResult` shape:
 *
 *  - an **obligation guard**: a human correction compiled into a rule, checked
 *    against the run's own tool-call record;
 *  - a **budget guard**: a novelty ceiling — when the run stops producing new
 *    evidence, it is redirected instead of repeating itself.
 *
 * Both are *observational*: they inject a notice, they never abort the turn.
 */

describe("obligationGuard — compiled corrections", () => {
  it("fires when the run invokes a program the human forbade", () => {
    const res = obligationGuard({
      obligations: [{ subject: "head", kind: "method", raw: "stop using head" }],
      toolCalls: [{ name: "bash", args: { command: "git log | head -20" } }],
    })
    expect(res.action).toBe("continue")
    expect(res.reason).toBe("obligation")
    expect(res.inject).toContain("head")
  })

  it("does not fire when the program is not the one forbidden", () => {
    const res = obligationGuard({
      obligations: [{ subject: "head", kind: "method", raw: "stop using head" }],
      toolCalls: [{ name: "bash", args: { command: "git log --oneline" } }],
    })
    expect(res.action).toBe("accept")
  })

  it("does not fire when the forbidden program appears as a word argument", () => {
    const res = obligationGuard({
      obligations: [{ subject: "head", kind: "method", raw: "stop using head" }],
      toolCalls: [{ name: "bash", args: { command: "echo head" } }],
    })
    expect(res.action).toBe("accept")
  })

  it("accepts when there are no obligations", () => {
    const res = obligationGuard({
      obligations: [],
      toolCalls: [{ name: "bash", args: { command: "git log | head -20" } }],
    })
    expect(res.action).toBe("accept")
  })

  it("names the original words of the human in the injection", () => {
    const res = obligationGuard({
      obligations: [{ subject: "head", kind: "method", raw: "stop using head" }],
      toolCalls: [{ name: "bash", args: { command: "head -50 file" } }],
    })
    expect(res.inject).toContain("stop using head")
  })
})

describe("budgetGuard — novelty ceiling", () => {
  it("continues while the run keeps producing new evidence", () => {
    const res = budgetGuard({
      toolCalls: [{ name: "bash", args: { command: "a" } }],
      novelty: [{ fingerprints: ["f1"], evidence: [] }],
      floor: 0.5,
    })
    expect(res.action).toBe("accept")
  })

  it("redirects when the novelty rate falls below the floor", () => {
    const res = budgetGuard({
      toolCalls: [
        { name: "bash", args: { command: "a" } },
        { name: "bash", args: { command: "b" } },
      ],
      novelty: [
        { fingerprints: [], evidence: [] },
        { fingerprints: [], evidence: [] },
      ],
      floor: 0.5,
    })
    expect(res.action).toBe("continue")
    expect(res.reason).toBe("budget")
    expect(res.inject).toContain("novelty")
  })

  it("reports the novelty rate in the injection", () => {
    const res = budgetGuard({
      toolCalls: [{ name: "bash", args: { command: "a" } }],
      novelty: [{ fingerprints: [], evidence: [] }],
      floor: 0.5,
    })
    expect(res.inject).toContain("0.000")
  })

  it("treats a repeated fingerprint as no novelty", () => {
    const res = budgetGuard({
      toolCalls: [
        { name: "bash", args: { command: "a" } },
        { name: "bash", args: { command: "b" } },
        { name: "bash", args: { command: "c" } },
      ],
      novelty: [
        { fingerprints: ["same"], evidence: [] },
        { fingerprints: ["same"], evidence: [] },
        { fingerprints: ["same"], evidence: [] },
      ],
      floor: 0.5,
    })
    expect(res.action).toBe("continue")
  })

  it("credits only the action that first produced a fingerprint", () => {
    // The first sighting establishes the fact; every later sighting is the
    // same fact again and must not be credited as progress.
    const res = budgetGuard({
      toolCalls: [
        { name: "bash", args: { command: "a" } },
        { name: "bash", args: { command: "b" } },
      ],
      novelty: [
        { fingerprints: ["same"], evidence: [] },
        { fingerprints: ["same"], evidence: [] },
      ],
      floor: 0.5,
    })
    // One of the two actions produced the fact for the first time, so the
    // rate is exactly the floor: the run is still within budget, and the
    // second action was not credited as progress.
    expect(res.action).toBe("accept")
  })
})
