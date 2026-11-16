export type KappaEmbeddingModel = {
  id: string
  name: string
  dimension: number
  scoreThreshold: number
  note?: string
}

export type KappaEmbeddingModelCatalog = {
  defaultModel: string
  models: KappaEmbeddingModel[]
  aliases: Record<string, string>
}

export const EMPTY_KAPPA_EMBEDDING_MODEL_CATALOG: KappaEmbeddingModelCatalog = {
  defaultModel: "",
  models: [],
  aliases: {},
}

// Kilo/OpenCode backwards-compat aliases: kappa is a derivative of OpenCode/Kilo;
// downstream consumers that still import the upstream `EMPTY_KILO_*` or
// `EMPTY_OPENCODE_*` names keep resolving to the same canonical constant.
export const EMPTY_KILO_EMBEDDING_MODEL_CATALOG: KappaEmbeddingModelCatalog =
  EMPTY_KAPPA_EMBEDDING_MODEL_CATALOG
export const EMPTY_OPENCODE_EMBEDDING_MODEL_CATALOG: KappaEmbeddingModelCatalog =
  EMPTY_KAPPA_EMBEDDING_MODEL_CATALOG

export function normalizeKappaEmbeddingModelId(model: string | undefined, catalog = EMPTY_KILO_EMBEDDING_MODEL_CATALOG) {
  if (!model) return undefined
  return catalog.aliases[model] ?? model
}

export function getKappaEmbeddingModel(model: string | undefined, catalog = EMPTY_KILO_EMBEDDING_MODEL_CATALOG) {
  const id = normalizeKappaEmbeddingModelId(model, catalog)
  return catalog.models.find((item) => item.id === id)
}

export function formatKappaEmbeddingModelLabel(model: KappaEmbeddingModel): string {
  const note = model.note ? `${model.note}, ` : ""
  return `${model.name} (${note}${model.dimension}d)`
}
