// kappacode_change - new file
// Bun 1.4 narrows NodeJS.Process event overloads.
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
