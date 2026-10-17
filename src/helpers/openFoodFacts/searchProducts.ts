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

// Open Food Facts' search does not allow browsers on other sites to call it
// directly (no CORS headers), so requests go through our own Caddy, which
// forwards /off-search and /off-classic to Open Food Facts.
const SEARCH_URL = '/off-search'
const CLASSIC_URL = '/off-classic'

// Shop names describe where you bought something, but are often not on the
// product itself (Lidl sells under Milbona, Favorina, ...). They are not
// required to match; products from that shop's own brands are shown first.
const SHOPS: Record<string, string[]> = {
  ah: ['ah', 'albert heijn'],
  aldi: ['aldi'],
  dirk: ['dirk'],
  jumbo: ['jumbo'],
  lidl: [
    'lidl',
    'milbona',
    'linessa',
    'pilos',
    'solevita',
    'chef select',
    'combino',
    'crownfield',
    'dulano',
    'alesto',
    'fin carre',
    'favorina',
    'freeway',
    'tastino',
    'vitasia',
    'italiamo',
    'deluxe',
    'snack day',
    'kania',
    'bellarom',
    'gelatelli',
    'baresa',
    'eridanous',
    'sondey',
    'w5',
    'cien',
  ],
  plus: ['plus'],
}
const SHOP_ALIASES: Record<string, string> = {
  albert: 'ah',
  heijn: 'ah',
}
const shopOf = (word: string) =>
  SHOPS[word] ? word : SHOP_ALIASES[word] || null

const normalise = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const words = (value: string) =>
  normalise(value)
    .split(/[^a-z0-9%]+/)
    .filter(Boolean)

/** Split "lidl griekse yoghurt" into shops ["lidl"] and words ["griekse", "yoghurt"] */
export const parseQuery = (query: string) => {
  const all = words(query)
  const shops = [...new Set(all.map(shopOf).filter(Boolean))] as string[]
  const required = all.filter((word) => !shopOf(word))
  return { required, shops }
}

/**
 * Keep products whose name or brand contains every word you typed (shop names
 * optional), the shop's own products first. The search service itself matches
 * ANY word, which turns "lidl yoghurt" into every Lidl product plus every yoghurt.
 */
export const rankHits = (hits: ProductHit[], query: string) => {
  const { required, shops } = parseQuery(query)
  if (required.length === 0) return hits // e.g. just "lidl"

  const matches = (text: string, word: string) =>
    text.split(' ').some((part) => part.startsWith(word)) ||
    (word.length >= 4 && text.includes(word))

  return hits
    .map((hit, index) => {
      const text = ` ${words(`${hit.name} ${hit.brand || ''}`).join(' ')} `
      const all = required.every((word) => matches(text.trim(), word))
      const shopScore = shops.filter((shop) =>
        SHOPS[shop].some((brand) => text.includes(` ${brand} `))
      ).length
      return { all, hit, index, shopScore }
    })
    .filter((row) => row.all)
    .sort((a, b) => b.shopScore - a.shopScore || a.index - b.index)
    .map((row) => row.hit)
}

/** What we send to the search service: shop names would only add noise */
export const searchText = (query: string) => {
  const { required } = parseQuery(query)
  return required.length > 0 ? required.join(' ') : query.trim()
}

/** Search-a-licious: fast, but its index can lag behind the newest products */
const searchALicious = async (text: string, onlyNetherlands: boolean) => {
  // Note: this service needs filters added with a space, not with AND
  const terms = searchText(text)
  const q = onlyNetherlands ? `${terms} countries_tags:"en:netherlands"` : terms
  const response = await axios.get(SEARCH_URL, {
    params: { fields: FIELDS, langs: 'nl,en', page_size: 60, q },
    timeout: TIMEOUT,
  })
  return rankHits(toProductHits(response.data?.hits || []), text)
}

/** The classic search: slower and rate-limited, used as a fallback */
const classicSearch = async (text: string) => {
  const response = await axios.get(CLASSIC_URL, {
    params: {
      action: 'process',
      fields: FIELDS,
      json: 1,
      page_size: 30,
      search_simple: 1,
      search_terms: searchText(text),
    },
    timeout: TIMEOUT,
  })
  return rankHits(toProductHits(response.data?.products || []), text)
}

/**
 * Find supermarket products (Albert Heijn, Lidl, ...) by name in Open Food Facts.
 * Prefers products sold in the Netherlands, then widens the search.
 * Returns an empty list when nothing matches; throws only if no search worked.
 */
export const searchProducts = async (text: string): Promise<ProductHit[]> => {
  const query = text.trim()
  if (query.length < 2) return []
  let reached = false
  try {
    const dutch = await searchALicious(query, true)
    reached = true
    if (dutch.length > 0) return dutch.slice(0, 15)
    const anywhere = await searchALicious(query, false)
    if (anywhere.length > 0) return anywhere.slice(0, 15)
  } catch {
    // Fall through to the classic search
  }
  try {
    return (await classicSearch(query)).slice(0, 15)
  } catch (error) {
    // The fast search answered but found nothing: that is "no results",
    // not a connection problem
    if (reached) return []
    throw error
  }
}
