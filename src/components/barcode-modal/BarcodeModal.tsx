import { css } from '@emotion/react'
import axios from 'axios'
import { compareVersions } from 'compare-versions'
import { debounce } from 'lodash-es'
import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { UAParser } from 'ua-parser-js'
import BarcodeWithoutScanner from '../../assets/common/barcode-without-scanner.svg'
import type { Unit } from '../../constants/units'
import { capitalize } from '../../helpers/capitalize'
import { getDispatch } from '../../helpers/getDispatch'
import { isMobileSafari } from '../../helpers/isMobileSafari'
import { isNumeric } from '../../helpers/isNumeric'
import {
  buildCustomFood,
  parseProduct,
} from '../../helpers/openFoodFacts/productToFood'
import { round } from '../../helpers/round'
import { Food } from '../../models/food'
import { type Barcode, defaultMeal } from '../../models/log'
import type { Profile } from '../../models/profile'
import type { NavbarState } from '../../store/navbar/types'
import { useStoreon } from '../../storeon'
import { colors } from '../../theme'
import { Explanation } from '../explanation/Explanation'
import { Image } from '../image/Image'
import { mapOtherVolumeUnitToTbsp } from '../macros/helpers/mapOtherVolumeUnitToTbsp'
import Scan from '../scanner/components/scan'
import { Spinner } from '../spinner/Spinner'
import { ButtonPanel } from '../standard-adder/components/ButtonPanel'
import { InputFields } from '../standard-adder/components/InputFields'
import { submitEditor } from '../standard-adder/helpers/submitEditor'

type props = {
  profile: Profile
  type: 'ingredient' | 'log'
  foods?: Food[]
}
export const BarcodeModal: React.FC<props> = ({
  foods = [],
  profile,
  type,
}) => {
  const { enablePlanning } = profile
  const dispatch = getDispatch()
  const { navbar }: { navbar: NavbarState } = useStoreon('navbar')
  // Set when a product was picked from the shop product search
  const preset = navbar.barcodePreset

  const [barcode, setBarcode] = useState(null as Barcode | null)
  const [brand, setBrand] = useState(null as string | null)
  const [existingFood, setExistingFood] = useState(null as Food | null)
  const [amount, setAmount] = useState('')
  const [meal, setMeal] = useState(defaultMeal)
  // Save products to your own foods by default, so search finds them next time
  const [createCustomFood, setCreateCustomFood] = useState(type === 'log')

  const [unit, setUnit] = useState('GRAM' as Unit)
  const [ran, setRan] = useState(false)

  // 3017620422003 (Nutella) is a good test value for grams
  // 0096619445387 (Olive Oil) is a good test value for liquids
  const fetchData = debounce((code: string) => {
    setRan(true)
    axios
      .get(`https://world.openfoodfacts.org/api/v0/product/${code}.json`)
      .then((r) => {
        if (r.data.status_verbose !== 'product found') {
          dispatch('closeBarcodeModal')
          toast.error('Matching food not found!')
          return
        }
        const parsed = parseProduct(code, r.data.product)
        if (!parsed) {
          dispatch('closeBarcodeModal')
          toast.error(
            'This product has no calorie information in Open Food Facts yet.'
          )
          return
        }
        // Already saved as one of your foods? Log that instead of a duplicate.
        const saved = foods.find((food) => food.openFoodFactsCode === code)
        setExistingFood(saved || null)
        setBrand(parsed.brand)
        setBarcode(parsed.barcode)
      })
      .catch(() => {
        dispatch('closeBarcodeModal')
        toast.error("Couldn't reach Open Food Facts. Please try again.")
      })
  }, 100)

  useEffect(() => {
    if (preset && !ran) {
      fetchData(preset)
    }
  }, [preset])

  const parser = UAParser(window.navigator.userAgent)
  const browser = parser.browser
  // Bug: Designed to handle "Invalid argument not valid semver ('X.X,X' received)"
  const version = String(browser.version).replace(',', '.').replace(',', '.')

  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_Security_Policy

  const oldSafari =
    isMobileSafari() &&
    // 'wasm-unsafe-eval' is only supported on Safari 16 and above
    compareVersions('16.0.0', version) === 1

  // 'wasm-unsafe-eval' is only supported on Chrome 103 and above
  const oldChrome =
    browser.name === 'Chrome' && compareVersions('103', version) === 1

  // 'wasm-unsafe-eval' is only supported on Firefox 102 and above
  const oldFirefox =
    browser.name === 'Firefox' && compareVersions('102', version) === 1

  if (oldSafari || oldChrome || oldFirefox) {
    return (
      <Explanation
        color="blue"
        css={css`
          margin: 0px auto;
          margin-top: 20px;
          width: 90%;
        `}
      >
        <div>
          For security reasons, this feature is not supported on your version of
          your browser. Please update to the latest version.
        </div>
      </Explanation>
    )
  }

  const selectedItem = new Food()
  if (barcode) {
    selectedItem.name = barcode.name
    selectedItem.caloriesPerCount = barcode.calories_per_serving
    selectedItem.proteinPerCount = barcode.protein_per_serving
    if (
      barcode?.calories_per_gram &&
      isNumeric(barcode?.calories_per_gram) &&
      // Only when the label has a serving size
      barcode.calories_per_serving > 0
    ) {
      if (barcode?.nutrition_data_per === '100ml') {
        // Weight: Easy. 120 calories per serving / 40 calories per gram = 3 grams per serving
        // Volume: Harder. 120 calories per serving / 8 calories per mL = 15 mL per serving
        // 15 mL per serving is 1 TBSP per serving
        selectedItem.countToTbsp = mapOtherVolumeUnitToTbsp(
          'mL',
          round(barcode.calories_per_serving / barcode.calories_per_gram, 0)
        )
      } else {
        selectedItem.countToGram = round(
          barcode.calories_per_serving / barcode.calories_per_gram,
          0
        )
      }
    }
  }

  // The custom food that will be saved (label serving, or a 100 g portion)
  const draft =
    barcode && type === 'log' && !existingFood
      ? buildCustomFood(
          barcode,
          brand,
          foods.filter((food) => food.foodToProfile !== null).map((f) => f.name)
        )
      : null
  const foodToCreate = new Food()
  if (draft) {
    foodToCreate.name = draft.name
    foodToCreate.countName = draft.countName
    foodToCreate.caloriesPerCount = draft.caloriesPerCount
    foodToCreate.proteinPerCount = draft.proteinPerCount
    foodToCreate.countToGram = draft.countToGram
    foodToCreate.countToTbsp = draft.countToTbsp
  }
  const saving = Boolean(draft && createCustomFood)
  const itemForInputs = existingFood || (saving ? foodToCreate : selectedItem)

  return (
    <>
      {!barcode && preset ? (
        <div className="fcc" style={{ padding: 40 }}>
          <Spinner color={colors.purple} />
        </div>
      ) : !barcode ? (
        <Scan
          scanRate={250}
          onScan={(code: string) => !ran && fetchData(code)}
        />
      ) : (
        <div>
          <div className={'w100 fr m20'}>
            <Image
              width={50}
              height={50}
              src={BarcodeWithoutScanner}
              alt="Barcode"
            />
            <span
              css={css`
                margin-left: 15px;
                font-size: 1rem;
                font-weight: 400;
              `}
            >
              {capitalize(
                existingFood?.name ||
                  (brand ? `${brand} ${barcode.name}` : barcode.name) ||
                  'Unknown'
              )}
            </span>
          </div>
          <InputFields
            selectedItem={itemForInputs}
            unit={unit}
            setUnit={setUnit}
            amount={amount}
            setAmount={setAmount}
            enablePlanning={enablePlanning}
            meal={meal}
            setMeal={setMeal}
          />
          {existingFood && type === 'log' && (
            <div className="fr mt10" style={{ fontSize: '0.85rem' }}>
              Already in your foods as “{existingFood.name}”.
            </div>
          )}
          {draft && (
            <div className="fr">
              <label htmlFor="customFood">
                Save to my foods (find it by name next time)
              </label>
              <input
                checked={createCustomFood}
                onChange={(e) => {
                  setCreateCustomFood(e.target.checked)
                }}
                id="customFood"
                type="checkbox"
              />
            </div>
          )}

          <ButtonPanel
            showSubmit={Boolean(amount && unit)}
            submit={() => {
              if (existingFood && type === 'log') {
                submitEditor(
                  type,
                  null,
                  Number(amount),
                  unit,
                  null,
                  enablePlanning,
                  meal,
                  dispatch,
                  existingFood
                )
                return
              }
              submitEditor(
                type,
                null,
                Number(amount),
                unit,
                barcode,
                enablePlanning,
                meal,
                dispatch,
                type === 'ingredient' ? selectedItem : undefined,
                saving ? foodToCreate : undefined
              )
            }}
          />
        </div>
      )}
    </>
  )
}
