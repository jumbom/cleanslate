import {
  buildCustomFood,
  parseProduct,
  productName,
  uniqueName,
} from './productToFood'
import {
  parseQuery,
  pickText,
  rankHits,
  searchText,
  toProductHits,
} from './searchProducts'

const skyr = {
  brands: 'AH,Albert Heijn',
  nutriments: {
    'energy-kcal_100g': 63,
    'energy-kcal_serving': 94.5,
    proteins_100g: 11,
    proteins_serving: 16.5,
  },
  nutrition_data_per: '100g',
  product_name: 'Skyr naturel',
  product_name_nl: 'Skyr naturel',
}

describe('parseProduct', () => {
  it('reads name, brand and nutrition', () => {
    const parsed = parseProduct('8718907000001', skyr)
    expect(parsed?.brand).toBe('AH')
    expect(parsed?.barcode.name).toBe('Skyr naturel')
    expect(parsed?.barcode.calories_per_gram).toBeCloseTo(0.63)
    expect(parsed?.barcode.protein_per_gram).toBeCloseTo(0.11)
    expect(parsed?.barcode.calories_per_serving).toBe(94.5)
  })
  it('rejects products without calories', () => {
    expect(parseProduct('1', { nutriments: {}, product_name: 'X' })).toBeNull()
  })
  it('prefers the Dutch name', () => {
    const parsed = parseProduct('1', {
      ...skyr,
      product_name: 'Skyr plain',
      product_name_nl: 'Skyr naturel',
    })
    expect(parsed?.barcode.name).toBe('Skyr naturel')
  })
})

describe('buildCustomFood', () => {
  it('uses the label serving when available', () => {
    const { barcode, brand } = parseProduct('8718907000001', skyr) as any
    const food = buildCustomFood(barcode, brand, [])
    expect(food).toEqual({
      caloriesPerCount: 94.5,
      countName: 'Serving (150 g)',
      countToGram: 150,
      countToTbsp: null,
      name: 'AH Skyr naturel',
      proteinPerCount: 16.5,
    })
  })

  it('falls back to a 100 g portion without serving data', () => {
    const { barcode, brand } = parseProduct('2000000000002', {
      brands: 'Milbona',
      nutriments: { 'energy-kcal_100g': 68, proteins_100g: 12 },
      product_name: 'Magere kwark',
    }) as any
    const food = buildCustomFood(barcode, brand, [])
    expect(food.countName).toBe('100 g')
    expect(food.countToGram).toBe(100)
    expect(food.caloriesPerCount).toBe(68)
    expect(food.proteinPerCount).toBe(12)
    expect(food.name).toBe('Milbona Magere kwark')
  })

  it('handles drinks per 100 ml', () => {
    const { barcode, brand } = parseProduct('3', {
      nutriments: { 'energy-kcal_100g': 45, proteins_100g: 3.4 },
      nutrition_data_per: '100ml',
      product_name: 'Halfvolle melk',
    }) as any
    const food = buildCustomFood(barcode, brand, [])
    expect(food.countName).toBe('100 ml')
    expect(food.countToGram).toBeNull()
    expect(food.countToTbsp).toBeCloseTo(6.76)
  })
})

describe('names', () => {
  it('does not repeat a brand already in the name', () => {
    expect(productName('AH Skyr', 'AH')).toBe('AH Skyr')
    expect(productName('Skyr', null)).toBe('Skyr')
  })
  it('keeps names unique', () => {
    expect(uniqueName('AH Skyr', ['ah skyr'], '8718907000001')).toBe(
      'AH Skyr (0001)'
    )
    expect(uniqueName('AH Skyr', [], '1')).toBe('AH Skyr')
  })
})

describe('search results', () => {
  it('accepts language objects as well as strings', () => {
    expect(pickText({ main: 'Skyr', nl: 'Skyr naturel' })).toBe('Skyr naturel')
    expect(pickText(['AH'])).toBe('AH')
    expect(pickText('  ')).toBeNull()
  })
  it('skips duplicates and products without a name', () => {
    const hits = toProductHits([
      { brands: 'AH, Albert Heijn', code: '1', product_name: 'Skyr' },
      { code: '1', product_name: 'Skyr' },
      { code: '2' },
      { code: 3, product_name: { main: 'Kwark' }, quantity: '500 g' },
    ])
    expect(hits).toEqual([
      { brand: 'AH', code: '1', name: 'Skyr', quantity: null },
      { brand: null, code: '3', name: 'Kwark', quantity: '500 g' },
    ])
  })
})

describe('rankHits', () => {
  const hit = (name: string, brand: string | null = null) => ({
    brand,
    code: name,
    name,
    quantity: null,
  })
  // Real results the search service returned for "lidl yoghurt"
  const results = [
    hit('Yoghurt & banana', 'Yoghurt'),
    hit('Sintfiguren Lidl', 'Favorina'),
    hit('Freeway Cola', 'Freeway'),
    hit('Griekse yoghurt', 'Lidl'),
    hit('Volle yoghurt', 'Milbona'),
  ]

  it('requires every word except shop names, shop matches first', () => {
    expect(rankHits(results, 'Lidl yoghurt').map((h) => h.name)).toEqual([
      'Griekse yoghurt',
      'Volle yoghurt', // Milbona is a Lidl brand
      'Yoghurt & banana',
    ])
  })
  it('matches the start of words and ignores accents and case', () => {
    expect(
      rankHits([hit('Crème fraîche'), hit('Kwark')], 'creme fr').map(
        (h) => h.name
      )
    ).toEqual(['Crème fraîche'])
  })
  it('keeps everything when only a shop name is typed', () => {
    expect(rankHits(results, 'lidl')).toHaveLength(5)
  })
  it('drops results that miss a word', () => {
    expect(rankHits(results, 'ah skyr')).toEqual([])
  })
})

describe('parseQuery', () => {
  it('separates shop names from product words', () => {
    expect(parseQuery('Albert Heijn griekse yoghurt')).toEqual({
      required: ['griekse', 'yoghurt'],
      shops: ['ah'],
    })
    expect(searchText('lidl yoghurt')).toBe('yoghurt')
    expect(searchText('lidl')).toBe('lidl')
  })
  it('puts Albert Heijn products first for "ah"', () => {
    const hits = [
      { brand: 'Arla', code: '1', name: 'Skyr naturel', quantity: null },
      { brand: 'Albert Heijn', code: '2', name: 'Skyr', quantity: null },
    ]
    expect(rankHits(hits, 'ah skyr').map((h) => h.code)).toEqual(['2', '1'])
  })
})
