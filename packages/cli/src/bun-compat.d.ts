// kappacode_change - new file
// Bun 1.4 narrows NodeJS.Process event overloads.

// kappacode_change - ambient declarations for kilo env helpers.
// The migration commit (fd4b92e5) removed the global exposure that made
// kiloEnv / kiloTruthy / kiloFalsy / kiloNumber available without import.
// Re-adding ambient declarations so the ~210 existing call sites resolve
// without per-file imports.
declare global {
  function kiloEnv(key: string): string | undefined
  function kiloTruthy(key: string): boolean
  function kiloFalsy(key: string): boolean
  function kiloNumber(key: string): number | undefined
}

declare global {
  namespace NodeJS {
    interface Process {
      on(event: string | symbol, listener: (...args: never[]) => void): this
      off(event: string | symbol, listener: (...args: never[]) => void): this
    }
  }

  // Kilo env helpers are used as bare globals (no import) across cli tests
  // and legacy call sites; the runtime assignment lives in
  // packages/core/src/flag/flag.ts, this declaration satisfies the typechecker.
  function kiloEnv(key: string): string | undefined
  function kiloTruthy(key: string): boolean
  function kiloFalsy(key: string): boolean
  function kiloNumber(key: string): number | undefined
}

export {}
