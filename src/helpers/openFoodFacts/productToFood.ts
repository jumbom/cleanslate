import type { Barcode } from '../../models/log'

const ML_TO_TBSP = 0.067628

const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : (value as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/** Turn an Open Food Facts product (v0 API) into Clean Slate's barcode format */
export const parseProduct = (
  code: string,
  product: Record<string, any>
): { barcode: Barcode; brand: string | null } | null => {
  const nutriments = product?.nutriments || {}
  const kcal100 = num(nutriments['energy-kcal_100g'])
  const protein100 = num(nutriments.proteins_100g)
  const name =
    text(product?.product_name_nl) ||
    text(product?.product_name) ||
    text(product?.generic_name_nl) ||
    text(product?.generic_name)
  if (kcal100 === null || !name) return null

  const brand = text(product?.brands)?.split(',')[0].trim() || null
  return {
    barcode: {
      calories_per_gram: kcal100 / 100, // or per mL
      calories_per_serving: num(nutriments['energy-kcal_serving']) as number,
      code,
      name,
      nutrition_data_per:
        product?.nutrition_data_per === '100ml' ? '100ml' : '100g',
      protein_per_gram: (protein100 ?? 0) / 100, // or per mL
      protein_per_serving: num(nutriments.proteins_serving) as number,
    },
    brand,
  }
}

export type CustomFoodDraft = {
  name: string
  countName: string
  caloriesPerCount: number
  proteinPerCount: number
  countToGram: number | null
  countToTbsp: number | null
}

/** "Skyr naturel" by "AH" becomes "AH Skyr naturel"; already-branded names stay */
export const productName = (name: string, brand: string | null) => {
  if (!brand) return name
  return name.toLowerCase().includes(brand.toLowerCase())
    ? name
    : `${brand} ${name}`
}

/** Food names must be unique per person; add a short suffix if needed */
export const uniqueName = (name: string, existing: string[], code: string) => {
  const taken = new Set(existing.map((n) => n.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  const withCode = `${name} (${code.slice(-4)})`
  if (!taken.has(withCode.toLowerCase())) return withCode
  let i = 2
  while (taken.has(`${withCode} ${i}`.toLowerCase())) i++
  return `${withCode} ${i}`
}

/**
 * Build a custom food from a product so it shows up in your own search next time.
 * Uses the label's serving when it has one, otherwise a 100 g (or 100 ml) portion,
 * so it can always be logged in grams as well as portions.
 */
export const buildCustomFood = (
  barcode: Barcode,
  brand: string | null,
  existingNames: string[]
): CustomFoodDraft => {
  const perMl = barcode.nutrition_data_per === '100ml'
  const servingCalories = num(barcode.calories_per_serving)
  const servingProtein = num(barcode.protein_per_serving)
  const hasServing =
    servingCalories !== null &&
    servingCalories > 0 &&
    barcode.calories_per_gram > 0

  // Size of one portion in grams (or mL)
  const portion = hasServing
    ? Math.round((servingCalories as number) / barcode.calories_per_gram)
    : 100

  const caloriesPerCount = hasServing
    ? (servingCalories as number)
    : barcode.calories_per_gram * 100
  const proteinPerCount =
    hasServing && servingProtein !== null
      ? servingProtein
      : barcode.protein_per_gram * portion

  const unitLabel = perMl ? 'ml' : 'g'
  return {
    caloriesPerCount: Math.round(caloriesPerCount * 10) / 10,
    countName: hasServing
      ? `Serving (${portion} ${unitLabel})`
      : `100 ${unitLabel}`,
    countToGram: perMl ? null : portion,
    countToTbsp: perMl ? Math.round(portion * ML_TO_TBSP * 100) / 100 : null,
    name: uniqueName(
      productName(barcode.name, brand),
      existingNames,
      barcode.code
    ),
    proteinPerCount: Math.round(proteinPerCount * 10) / 10,
  }
}
