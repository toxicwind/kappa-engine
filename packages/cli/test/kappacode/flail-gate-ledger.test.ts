import { describe, it, expect } from "bun:test"
import { appendLedgerEntry, type LedgerEntry } from "@/kappacode/flail-gate"

/**
 * The kappa notebook already owns a `ledger` field — an unbounded list of
 * unknown records the flail gate appends its own history to.
 *
 * The obligation ledger belongs in that list rather than in a parallel file:
 * two ledgers is how a rule gets enforced in one place and forgotten in
 * another. The entry shape is therefore the notebook's own: a typed record
 * with a kind, so a reader can tell an obligation from a probe from a budget
 * reading.
 */

describe("kappa ledger integration", () => {
  it("appends an obligation entry to the ledger", () => {
    const ledger: LedgerEntry[] = []
    appendLedgerEntry(ledger, {
      kind: "obligation",
      subject: "head",
      obligationKind: "method",
      raw: "stop using head",
      state: "active",
    })
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.kind).toBe("obligation")
    expect(ledger[0]?.subject).toBe("head")
  })

  it("appends a budget reading to the ledger", () => {
    const ledger: LedgerEntry[] = []
    appendLedgerEntry(ledger, {
      kind: "budget",
      toolCalls: 12,
      noveltyRate: 0.02,
      floor: 0.05,
      verdict: "redirect",
    })
    expect(ledger[0]?.kind).toBe("budget")
    expect(ledger[0]?.noveltyRate).toBe(0.02)
  })

  it("keeps the entries in order", () => {
    const ledger: LedgerEntry[] = []
    appendLedgerEntry(ledger, { kind: "obligation", subject: "a", obligationKind: "method", raw: "r", state: "active" })
    appendLedgerEntry(ledger, { kind: "budget", toolCalls: 1, noveltyRate: 1, floor: 0.05, verdict: "continue" })
    expect(ledger.map((e) => e.kind)).toEqual(["obligation", "budget"])
  })

  it("bounds the ledger so it cannot grow without limit", () => {
    const ledger: LedgerEntry[] = []
    for (let i = 0; i < 500; i++) {
      appendLedgerEntry(ledger, { kind: "budget", toolCalls: i, noveltyRate: 1, floor: 0.05, verdict: "continue" })
    }
    expect(ledger.length).toBeLessThanOrEqual(200)
  })

  it("drops the oldest entries when the cap is reached", () => {
    const ledger: LedgerEntry[] = []
    for (let i = 0; i < 250; i++) {
      appendLedgerEntry(ledger, { kind: "budget", toolCalls: i, noveltyRate: 1, floor: 0.05, verdict: "continue" })
    }
    expect(ledger[0]?.toolCalls).toBe(50)
  })

  it("stamps the entry with a time", () => {
    const ledger: LedgerEntry[] = []
    appendLedgerEntry(ledger, { kind: "obligation", subject: "a", obligationKind: "method", raw: "r", state: "active" })
    expect(typeof ledger[0]?.at).toBe("number")
  })

  it("does not mutate the entry it is given", () => {
    const ledger: LedgerEntry[] = []
    const entry = { kind: "obligation" as const, subject: "a", obligationKind: "method" as const, raw: "r", state: "active" as const }
    appendLedgerEntry(ledger, entry)
    expect(entry).not.toHaveProperty("at")
  })
})
