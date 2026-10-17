import { css } from '@emotion/react'
import React from 'react'
import { toast } from 'react-toastify'
import { handleError } from '../../helpers/handleError'
import {
  planNewStrategy,
  type Strategy,
} from '../../helpers/history/computeHistory'
import {
  deleteStrategy,
  insertStrategy,
  updateStrategy,
} from '../../helpers/history/historyApi'
import { colors } from '../../theme'

type props = {
  strategy: Strategy | null // null = create a new strategy
  strategies: Strategy[]
  today: string
  focusReview?: boolean
  onDone: () => void
  onCancel: () => void
}

const editor = css`
  background-color: ${colors.background};
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 15px;
  label {
    display: block;
    font-size: 0.85rem;
    font-weight: 500;
    margin: 12px 0 5px;
  }
  textarea {
    min-height: 80px;
    resize: vertical;
    background-color: ${colors.white};
  }
  input {
    background-color: ${colors.white};
  }
  .grades {
    display: flex;
    gap: 6px;
    button {
      flex: 1;
      font-size: 1rem;
      padding: 10px 0;
      border: 1px solid ${colors.lightgrey};
      &.selected {
        background-color: ${colors.purple};
        color: white;
      }
    }
  }
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 15px;
    button {
      flex: 1;
    }
  }
`

const nullIfEmpty = (value: string) =>
  value.trim() === '' ? null : value.trim()

export const StrategyEditor: React.FC<props> = ({
  focusReview,
  onCancel,
  onDone,
  strategies,
  strategy,
  today,
}) => {
  const isNew = strategy === null
  const [name, setName] = React.useState(strategy?.name || '')
  const [startDate, setStartDate] = React.useState(strategy?.startDate || today)
  const [endDate, setEndDate] = React.useState(strategy?.endDate || '')
  const [planNote, setPlanNote] = React.useState(strategy?.planNote || '')
  const [grade, setGrade] = React.useState<number | null>(
    strategy?.grade ?? null
  )
  const [reviewNote, setReviewNote] = React.useState(strategy?.reviewNote || '')
  const [saving, setSaving] = React.useState(false)
  const reviewRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (focusReview) {
      reviewRef.current?.scrollIntoView({ block: 'center' })
    }
  }, [focusReview])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (endDate && endDate < startDate) {
      toast.error('The end date must be on or after the start date.')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        const { close, error } = planNewStrategy(strategies, startDate)
        if (error) {
          toast.error(error)
          setSaving(false)
          return
        }
        if (close) {
          await updateStrategy(close.id, { endDate: close.endDate })
        }
        await insertStrategy({
          endDate: nullIfEmpty(endDate),
          grade: null,
          name: name.trim(),
          planNote: nullIfEmpty(planNote),
          reviewNote: null,
          startDate,
        })
        toast.success(
          close
            ? 'Strategy started. The previous one has ended.'
            : 'Strategy started.'
        )
      } else {
        await updateStrategy(strategy.id, {
          endDate: nullIfEmpty(endDate),
          grade,
          name: name.trim(),
          planNote: nullIfEmpty(planNote),
          reviewNote: nullIfEmpty(reviewNote),
          startDate,
        })
        toast.success('Strategy saved.')
      }
      onDone()
    } catch (error) {
      handleError(error)
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!strategy) return
    if (!window.confirm(`Delete "${strategy.name}"? Your food logs stay.`)) {
      return
    }
    try {
      await deleteStrategy(strategy.id)
      onDone()
    } catch (error) {
      handleError(error)
    }
  }

  return (
    <form css={editor} onSubmit={save}>
      <div className="bold" style={{ fontSize: '1rem' }}>
        {isNew ? 'New strategy' : 'Edit strategy'}
      </div>

      <label htmlFor="strategyName">Name</label>
      <input
        id="strategyName"
        required
        maxLength={80}
        placeholder="e.g. Less fruit"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="fr" style={{ gap: 10 }}>
        <div className="expand">
          <label htmlFor="strategyStart">Start</label>
          <input
            id="strategyStart"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="expand">
          <label htmlFor="strategyEnd">End (optional)</label>
          <input
            id="strategyEnd"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <label htmlFor="strategyPlan">Plan: what are you trying, and why?</label>
      <textarea
        id="strategyPlan"
        placeholder="e.g. One portion of fruit a day; swap the rest for skyr."
        value={planNote}
        onChange={(e) => setPlanNote(e.target.value)}
      />

      {!isNew && (
        <>
          <label htmlFor="strategyGrade">Grade</label>
          <div id="strategyGrade" className="grades">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={grade === value ? 'selected' : ''}
                onClick={() => setGrade(grade === value ? null : value)}
              >
                {value}
              </button>
            ))}
          </div>

          <label htmlFor="strategyReview">Review: what did you learn?</label>
          <textarea
            id="strategyReview"
            ref={reviewRef}
            placeholder="e.g. Hungry in the evenings, hard at weekends, but weight dropped."
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
          />
        </>
      )}

      <div className="actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="purple bold" disabled={saving}>
          {isNew ? 'Start' : 'Save'}
        </button>
      </div>
      {!isNew && (
        <div className="actions">
          <button type="button" className="danger" onClick={remove}>
            Delete strategy
          </button>
        </div>
      )}
    </form>
  )
}
