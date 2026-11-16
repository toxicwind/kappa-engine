import { kiloEnv } from "../flag/flag"

export const KAPPA_RUN_ID = "KAPPA_RUN_ID"
export const KAPPA_PROCESS_ROLE = "KAPPA_PROCESS_ROLE"

// Kilo/OpenCode 3-way compat: these env-key constants resolve the actual env
// var name under any of the three lineages (KAPPA canonical, then KILO_* /
// OPENCODE_*). A Kilo/OpenCode-configured environment sets KILO_RUN_ID etc.
export function runIdEnvKey(): string {
  return kiloEnv("RUN_ID") ?? KAPPA_RUN_ID
}
export function processRoleEnvKey(): string {
  return kiloEnv("PROCESS_ROLE") ?? KAPPA_PROCESS_ROLE
}

export function ensureRunID() {
  return (process.env[runIdEnvKey()] ??= crypto.randomUUID())
}

export function ensureProcessRole(fallback: "main" | "worker") {
  return (process.env[processRoleEnvKey()] ??= fallback)
}

export function ensureProcessMetadata(fallback: "main" | "worker") {
  return {
    runID: ensureRunID(),
    processRole: ensureProcessRole(fallback),
  }
}

export function sanitizedProcessEnv(overrides?: Record<string, string>) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  return overrides ? Object.assign(env, overrides) : env
}
