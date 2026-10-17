import React from 'react'
import { toast } from 'react-toastify'
import { convertToNumber } from '../../helpers/convertToNumber'
import { addFoodToCloud } from '../../helpers/Food/addFoodToCloud'
import { updateQuickLogOnCloud } from '../../helpers/quick-log/updateQuickLogOnCloud'
import type { Food } from '../../models/food'
import type { Profile } from '../../models/profile'
import type { AllEvents } from '../../store/store'
import type { Dispatch } from '../../store/types'
import { useStoreon } from '../../storeon'
import { createDefaultItem } from '../item/helpers/createDefaultItem'
import type { CommonItem } from '../item/types'
import { SubmitButton } from '../item-update-modal/components/SubmitButton'

type props = {
  profile: Profile
  item: CommonItem | undefined
  foods?: Food[]
}
export const QuickLogUpdateModal: React.FC<props> = ({
  foods = [],
  item,
  profile,
}) => {
  const { dispatch }: { dispatch: Dispatch<AllEvents> } = useStoreon()
  const { enablePlanning } = profile
  const itemToUse =
    item === undefined ? createDefaultItem(enablePlanning) : item
  const [name, setName] = React.useState(itemToUse.name || '')
  const [calories, setCalories] = React.useState(itemToUse.calories || '')
  const [protein, setProtein] = React.useState(itemToUse.protein || '')

  // Create the local refs
  const inputRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    // Focus the calories input when the unit modal is spawned
    inputRef.current?.focus()
  }, [inputRef])

  // Turn this quick add into one of your foods, so search finds it next time
  const saveAsFood = () => {
    const foodName = name.trim()
    const caloriesNumber = convertToNumber(calories ?? 0) ?? 0
    const proteinNumber = convertToNumber(protein ?? 0) ?? 0
    if (!foodName || foodName === 'Quick Add') {
      toast.error('Give it a name first, e.g. "Lidl protein pudding"')
      return
    }
    if (!caloriesNumber) {
      toast.error('Enter the calories first')
      return
    }
    const taken = foods.some(
      (food) => food.name.toLowerCase() === foodName.toLowerCase()
    )
    if (taken) {
      toast.error(`You already have a food called "${foodName}"`)
      return
    }
    addFoodToCloud(
      {
        caloriesPerCount: caloriesNumber,
        category: 'Food',
        containerName: 'Container',
        countName: 'Serving',
        countToGram: null,
        countToTbsp: null,
        group: 'Custom',
        name: foodName,
        openFoodFactsCode: null,
        preferredVolumeUnit: 'TBSP',
        preferredWeightUnit: 'GRAM',
        proteinPerCount: proteinNumber,
        servingPerContainer: null,
      },
      () => {
        toast.success(`Saved "${foodName}" to your foods`)
      }
    )
  }

  return (
    <form
      className="mw600 mt30"
      onSubmit={(event) => {
        event.preventDefault()
        updateQuickLogOnCloud(
          {
            pk_columns: {
              id: itemToUse.id,
            },
            set: {
              calories: convertToNumber(calories ?? 0) ?? 0,
              name,
              protein: convertToNumber(protein ?? 0) ?? 0,
            },
          },
          () => {
            dispatch('closeQuickLogEditModal')
          }
        )
      }}
    >
      <label htmlFor="name">Name</label>
      <input
        autoCapitalize={'off'}
        autoComplete={'off'}
        autoCorrect={'off'}
        id="name"
        onChange={(event) => {
          setName(event.target.value)
        }}
        placeholder="Food (Optional)"
        step="any"
        type="string"
        value={name === 'Quick Add' ? '' : name}
      />
      <label htmlFor="calories">Calories</label>
      <input
        autoCapitalize={'off'}
        autoComplete={'off'}
        autoCorrect={'off'}
        id="calories"
        onChange={(event) => {
          setCalories(event.target.value)
        }}
        placeholder="Calories"
        ref={inputRef}
        step="any"
        type="string"
        value={calories || ''}
      />
      <label htmlFor="protein">Protein</label>
      <input
        autoCapitalize={'off'}
        autoComplete={'off'}
        autoCorrect={'off'}
        id="protein"
        onChange={(event) => {
          setProtein(event.target.value)
        }}
        placeholder="Protein"
        step="any"
        type="string"
        value={protein || ''}
      />
      <div className="fr">
        <button
          type="button"
          className="mt10"
          css={{ fontSize: '0.85rem', padding: '12px 15px' }}
          onClick={saveAsFood}
        >
          Save as my food
        </button>
        <SubmitButton submit={true} />
      </div>
    </form>
  )
}
