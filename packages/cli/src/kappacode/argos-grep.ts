/**
 * argos-grep.ts — route broad /home/toxic/pens greps through the argos
 * pens-corpus index (fast, ranked, sees private-skills raw rg misses) instead
 * of a raw ripgrep filesystem scan. Permanent estate search doctrine: argos
 * first (:25254, ES-wire), ffs/ripgrep only as the fallback lane.
 *
 * Returns null when argos is unreachable or the search is not a plain-text
 * broad-pens search (regex, non-pens root, single-file), so the caller falls
 * through to ripgrep unchanged.
 */
export interface ArgosGrepHit {
  path: string
  title: string
}

const ARGOS_URL = "http://127.0.0.1:25254/pens-corpus/_search"
const PENS_ROOT = "/home/toxic/pens"

/** A pattern that is a plain literal term (no regex metacharacters). */
function isPlainTerm(pattern: string): boolean {
  return /^[A-Za-z0-9_.\-/:]+$/.test(pattern)
}

/**
 * Query argos for a plain term over the pens corpus. Returns ranked hits
 * (pens-relative ax_path prefixed to an absolute path) or null when argos is
 * down / the corpus has no hits.
 */
export async function argosGrep(
  pattern: string,
  root: string,
  signal?: AbortSignal,
): Promise<ArgosGrepHit[] | null> {
  if (!isPlainTerm(pattern)) return null
  if (!root.startsWith(PENS_ROOT)) return null
  try {
    const res = await fetch(ARGOS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: {
          bool: {
            should: [{ match_phrase: { text: pattern } }, { match: { text: pattern } }],
            minimum_should_match: 1,
          },
        },
        _source: ["ax_path", "title"],
        size: 30,
      }),
      signal: signal ?? AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const doc = (await res.json()) as {
      hits?: { hits?: Array<{ _source?: { ax_path?: string; title?: string } }> }
    }
    const hits = doc?.hits?.hits ?? []
    if (hits.length === 0) return null
    return hits.map((h) => {
      const src = h._source ?? {}
      const ax = src.ax_path ?? ""
      // ax_path is pens-relative (e.g. kind:skill/geode/azurite/...); strip a
      // leading kind: prefix and map to an absolute path under pens.
      const rel = ax.replace(/^[a-z]+:/, "")
      return { path: `${PENS_ROOT}/${rel}`, title: src.title ?? "" }
    })
  } catch {
    return null
  }
}