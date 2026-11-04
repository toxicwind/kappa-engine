import { describe, test, expect } from "bun:test"
import { model as modelEnv } from "@/kappacode/process/env"

describe("kappacode process env hooks kairos (anomaly #57)", () => {
  test("model() injects BASH_ENV pointing at the live kairos shim", () => {
    const env = modelEnv()
    expect(env.BASH_ENV).toBe(
      "/home/toxic/pens/olympus/products/kairos/shim.sh",
    )
  })

  test("model() preserves an explicit caller BASH_ENV override", () => {
    const env = modelEnv({ BASH_ENV: "/custom/shim.sh" })
    expect(env.BASH_ENV).toBe("/custom/shim.sh")
  })

  test("model() still strips server credentials", () => {
    const env = modelEnv({
      KAPPA_SERVER_PASSWORD: "pw",
      KAPPA_SERVER_USERNAME: "user",
      KAPPA_CONFIG: "cfg",
      KAPPA_CONFIG_DIR: "dir",
    })
    expect(env.KAPPA_SERVER_PASSWORD).toBeUndefined()
    expect(env.KAPPA_SERVER_USERNAME).toBeUndefined()
    expect(env.KAPPA_CONFIG).toBeUndefined()
    expect(env.KAPPA_CONFIG_DIR).toBeUndefined()
  })
})