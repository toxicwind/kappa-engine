import type { ProviderMetadata } from "@toxicwind/llm"
import { ProviderV2 } from "@toxicwind/core/provider"
import { ModelV2 } from "@toxicwind/core/model"
export namespace KappaRoutedModel {
  const ns = "kappacode"
  const key = "routedModelID"

  export function write(meta: ProviderMetadata | undefined, modelID: string | undefined) {
    const id = modelID?.trim()
    if (!id) return meta
    return {
      ...(meta ?? {}),
      [ns]: {
        ...(meta?.[ns] ?? {}),
        [key]: id,
      },
    } satisfies ProviderMetadata
  }

  export function display(modelID: string) {
    return modelID.trim().replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2})$/, "")
  }

  export function displayName(name: string) {
    return name
      .trim()
      .replace(/^[^:]+:\s+/, "")
      .replace(/^[^/\s]+\/(?=[^/]+$)/, "")
      .replace(/\s*\([^)]*%\s*off[^)]*\)\s*$/i, "")
      .replace(/^([A-Za-z]{2,})(?=\d)/, "$1 ")
      .replace(/\s+/g, " ")
  }

  export function read(meta: ProviderMetadata | undefined, providerID: ProviderV2.ID) {
    const value = meta?.[ns]?.[key]
    if (typeof value !== "string") return undefined
    const id = value.trim()
    if (!id) return undefined
    return {
      providerID,
      modelID: ModelV2.ID.make(id),
    }
  }

  export function readAuto(
    meta: ProviderMetadata | undefined,
    input: { providerID: ProviderV2.ID; modelID: string; selected?: string },
  ) {
    if (input.providerID !== ProviderV2.ID.kappa) return undefined
    // kilo-auto/ is kilo.ai's real gateway model ID prefix; the 8bb518ee
    // mass rename to kappa-auto/ broke routed-model detection (same
    // overreach as getSmallModel, fixed by 7664a197).
    if (!input.modelID.startsWith("kilo-auto/") && !input.modelID.startsWith("openrouter/") && !input.modelID.includes("fable")) return undefined
    const model = read(meta, input.providerID)
    if (!model) return undefined
    if (model.modelID === input.modelID || model.modelID === input.selected) return undefined
    return model
  }
}
