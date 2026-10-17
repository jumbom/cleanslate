import axios from 'axios'

/** A product found by name. Nutrition is fetched by barcode once selected. */
export type ProductHit = {
  code: string
  name: string
  brand: string | null
  quantity: string | null
}

const FIELDS = 'code,product_name,product_name_nl,brands,quantity'
const TIMEOUT = 8000

/**
 * Search-a-licious returns language-specific fields either as plain strings
 * or as objects keyed by language ({ main, nl, en, ... }). Accept both.
 */
export const pickText = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value.trim() || null
  }
  if (Array.isArray(value)) {
    return pickText(value[0])
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['nl', 'main', 'en']) {
      const text = pickText(record[key])
      if (text) return text
    }
    for (const entry of Object.values(record)) {
      const text = pickText(entry)
      if (text) return text
    }
  }
  return null
}

export const toProductHits = (items: unknown[]): ProductHit[] => {
  const seen = new Set<string>()
  const hits: ProductHit[] = []
  for (const item of items) {
    const raw = item as Record<string, unknown>
    const code =
      typeof raw.code === 'string' ? raw.code : String(raw.code || '')
    const name = pickText(raw.product_name_nl) || pickText(raw.product_name)
    if (!code || !name || seen.has(code)) continue
    seen.add(code)
    const brands = pickText(raw.brands)
    hits.push({
      brand: brands ? brands.split(',')[0].trim() : null,
      code,
      name,
      quantity: pickText(raw.quantity),
    })
  }
  return hits
}

/** Search-a-licious: fast, but its index can lag behind the newest products */
const searchALicious = async (text: string, onlyNetherlands: boolean) => {
  const q = onlyNetherlands
    ? `(${text}) AND countries_tags:"en:netherlands"`
    : text
  const response = await axios.get('https://search.openfoodfacts.org/search', {
    params: { fields: FIELDS, langs: 'nl,en', page_size: 15, q },
    timeout: TIMEOUT,
  })
  return toProductHits(response.data?.hits || [])
}

/** The classic search: slower and rate-limited, used as a fallback */
const classicSearch = async (text: string) => {
  const response = await axios.get(
    'https://nl.openfoodfacts.org/cgi/search.pl',
    {
      params: {
        action: 'process',
        fields: FIELDS,
        json: 1,
        page_size: 15,
        search_simple: 1,
        search_terms: text,
      },
      timeout: TIMEOUT,
    }
  )
  return toProductHits(response.data?.products || [])
}

/**
 * Find supermarket products (Albert Heijn, Lidl, ...) by name in Open Food Facts.
 * Prefers products sold in the Netherlands, then widens the search.
 */
export const searchProducts = async (text: string): Promise<ProductHit[]> => {
  const query = text.trim()
  if (query.length < 2) return []
  try {
    const dutch = await searchALicious(query, true)
    if (dutch.length > 0) return dutch
    const anywhere = await searchALicious(query, false)
    if (anywhere.length > 0) return anywhere
  } catch {
    // Fall through to the classic search
  }
  return classicSearch(query)
}
