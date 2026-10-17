import { css } from '@emotion/react'
import dayjs from 'dayjs'
import React from 'react'
import { toast } from 'react-toastify'
import { handleError } from '../../helpers/handleError'
import {
  calculateStrategyStats,
  type DaySummary,
  dayKey,
  historyStartDate,
  PART_LABELS,
  type Strategy,
  summariseDays,
  summariseTiming,
  summariseWeeks,
  type WeeklyWeight,
  type WeekSummary,
  weekStartOf,
} from '../../helpers/history/computeHistory'
import {
  deleteWeeklyWeight,
  fetchHistoryEntries,
  fetchStrategiesAndWeights,
  saveWeeklyWeight,
  updateStrategy,
} from '../../helpers/history/historyApi'
import type { Profile } from '../../models/profile'
import { colors } from '../../theme'
import { Spinner } from '../spinner/Spinner'
import { Tabs } from '../tabs/Tabs'
import { StrategyEditor } from './StrategyEditor'

type Tab = 'strategies' | 'weeks' | 'days'
type props = { profile: Profile; visible: boolean }

// ---------- formatting ----------
const kcal = (value: number | null) =>
  value === null ? '–' : `${Math.round(value).toLocaleString()} kcal`
const grams = (value: number | null) =>
  value === null ? '–' : `${Math.round(value).toLocaleString()} g`
const kg = (value: number | null) =>
  value === null
    ? '–'
    : `${value.toLocaleString(undefined, {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      })} kg`
const signedKg = (value: number | null) =>
  value === null
    ? '–'
    : `${value > 0 ? '+' : value < 0 ? '−' : '±'}${kg(Math.abs(value))}`
const shortDate = (day: string) => dayjs(day).format('D MMM')
const longDate = (day: string) => dayjs(day).format('ddd D MMM')
const stars = (grade: number) => '★'.repeat(grade) + '☆'.repeat(5 - grade)

const clock = (minutes: number | null) => {
  if (minutes === null) return '–'
  const m = Math.round(minutes) % (24 * 60)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
const PART_COLORS = ['#ffd166', '#93dcdc', '#5b7fb5']

/** A thin bar showing how calories were split over the eating window */
const Distribution: React.FC<{
  shares: [number, number, number] | null
  midpoint: number | null
  lateDays?: number
  showLegend?: boolean
}> = ({ lateDays = 0, midpoint, shares, showLegend = false }) => {
  if (!shares) return null
  return (
    <div className="distribution">
      <div className="bar">
        {shares.map((share, i) =>
          share > 0 ? (
            <div
              key={PART_LABELS[i]}
              style={{
                backgroundColor: PART_COLORS[i],
                width: `${share * 100}%`,
              }}
              title={`${PART_LABELS[i]}: ${Math.round(share * 100)}%`}
            />
          ) : null
        )}
      </div>
      <div className="muted legend">
        {shares.map((share, i) => (
          <span key={PART_LABELS[i]}>
            <i style={{ backgroundColor: PART_COLORS[i] }} />
            {showLegend ? `${PART_LABELS[i]} ` : ''}
            {Math.round(share * 100)}%
          </span>
        ))}
        <span>· half by {clock(midpoint)}</span>
        {lateDays > 0 && (
          <span className="late">
            · {lateDays === 1 ? 'food' : `${lateDays} days with food`} after
            16:00
          </span>
        )}
      </div>
    </div>
  )
}

const strategyOn = (strategies: Strategy[], day: string) =>
  strategies.find(
    (s) => s.startDate <= day && (s.endDate === null || day <= s.endDate)
  ) || null

// ---------- styles ----------
const container = css`
  width: 100%;
  .card {
    border: 1px solid ${colors.lightgrey};
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 12px;
  }
  .muted {
    color: ${colors.darkgrey};
    font-size: 0.85rem;
  }
  .title {
    font-weight: 600;
    font-size: 1.05rem;
    color: ${colors.black};
  }
  .badge {
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 3px 9px;
    white-space: nowrap;
  }
  .badge.review {
    background-color: ${colors.yellow};
  }
  .badge.ongoing {
    background-color: ${colors.green};
  }
  .stars {
    color: ${colors.purple};
    letter-spacing: 1px;
    white-space: nowrap;
  }
  .stats {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(2, 1fr);
    margin: 12px 0 4px;
    > div {
      background-color: ${colors.background};
      border-radius: 6px;
      padding: 8px 10px;
    }
    .value {
      color: ${colors.black};
      font-weight: 600;
    }
  }
  .note {
    font-size: 0.9rem;
    margin-top: 10px;
    white-space: pre-wrap;
  }
  .row {
    align-items: center;
    border-bottom: 1px solid ${colors.lightgrey};
    display: flex;
    gap: 10px;
    justify-content: space-between;
    padding: 12px 2px;
    > div:first-of-type {
      flex: 1;
      min-width: 0;
    }
  }
  .numbers {
    text-align: right;
    font-size: 0.9rem;
    color: ${colors.black};
  }
  .tag {
    background-color: ${colors.blue};
    border-radius: 4px;
    font-size: 0.75rem;
    padding: 2px 6px;
  }
  .toolbar {
    display: flex;
    gap: 8px;
    margin: 0 0 12px;
    button {
      flex: 1;
      border: 1px solid ${colors.lightgrey};
      padding: 8px 0;
      &.selected {
        background-color: ${colors.background};
        font-weight: 600;
      }
    }
  }
  .distribution {
    margin-top: 6px;
    min-width: 0;
    .bar {
      background-color: ${colors.lightgrey};
      border-radius: 4px;
      display: flex;
      height: 8px;
      overflow: hidden;
      width: 100%;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      font-size: 0.75rem;
      gap: 4px 10px;
      margin-top: 4px;
      i {
        border-radius: 2px;
        display: inline-block;
        height: 8px;
        margin-right: 4px;
        width: 8px;
      }
    }
    .late {
      color: ${colors.danger};
    }
  }
  .weight-input {
    display: flex;
    gap: 6px;
    input {
      width: 90px;
      padding: 6px 10px;
    }
    button {
      padding: 6px 12px;
    }
  }
`

// ---------- component ----------
export const HistoryModal: React.FC<props> = ({ profile, visible }) => {
  const [tab, setTab] = React.useState<Tab>('strategies')
  const [weeksBack, setWeeksBack] = React.useState(12)
  const [loading, setLoading] = React.useState(false)
  const [strategies, setStrategies] = React.useState<Strategy[]>([])
  const [weights, setWeights] = React.useState<WeeklyWeight[]>([])
  const [days, setDays] = React.useState<DaySummary[]>([])
  const [editing, setEditing] = React.useState<
    { strategy: Strategy | null; focusReview?: boolean } | undefined
  >(undefined)
  const [sortByGrade, setSortByGrade] = React.useState(false)
  const [weightWeek, setWeightWeek] = React.useState<string | null>(null)
  const [weightText, setWeightText] = React.useState('')

  const startTime = profile?.startTime || '00:00:00'
  const today = dayKey(new Date(), startTime)

  const load = React.useCallback(async () => {
    if (!profile?.startTime) return
    setLoading(true)
    try {
      const data = await fetchStrategiesAndWeights()
      setStrategies(data.strategies)
      setWeights(data.weights)
      const start = historyStartDate(data.strategies, weeksBack, today)
      const entries = await fetchHistoryEntries(start, profile)
      setDays(summariseDays(entries, startTime))
    } catch (error) {
      handleError(error)
    } finally {
      setLoading(false)
    }
  }, [profile, weeksBack, today, startTime])

  React.useEffect(() => {
    if (visible) {
      load()
    } else {
      setEditing(undefined)
      setWeightWeek(null)
    }
  }, [visible, load])

  // Every week in the chosen range gets a row, even an empty one,
  // so you can always enter this week's weight.
  const weeks: WeekSummary[] = React.useMemo(() => {
    const summaries = summariseWeeks(days, weights)
    const rows: WeekSummary[] = []
    const thisWeek = weekStartOf(today)
    for (let i = 0; i < weeksBack; i++) {
      const weekStart = dayjs(thisWeek).subtract(i, 'week').format('YYYY-MM-DD')
      rows.push(
        summaries.find((s) => s.weekStart === weekStart) || {
          avgCalories: null,
          avgProtein: null,
          daysLogged: 0,
          timing: summariseTiming([]),
          weekStart,
          weight: weights.find((w) => w.weekStart === weekStart) || null,
        }
      )
    }
    return rows
  }, [days, weights, weeksBack, today])

  const rangeStart = weeks[weeks.length - 1]?.weekStart || today
  const daysInRange = days.filter((d) => d.day >= rangeStart)

  const strategyRows = strategies
    .map((strategy) => ({
      stats: calculateStrategyStats(strategy, days, weights, today),
      strategy,
    }))
    .sort((a, b) =>
      sortByGrade
        ? (b.strategy.grade || 0) - (a.strategy.grade || 0) ||
          b.strategy.startDate.localeCompare(a.strategy.startDate)
        : b.strategy.startDate.localeCompare(a.strategy.startDate)
    )
  const reviewsDue = strategyRows.filter((row) => row.stats.reviewDue)

  const finishEditing = () => {
    setEditing(undefined)
    load()
  }

  const endNow = async (strategy: Strategy) => {
    try {
      await updateStrategy(strategy.id, { endDate: today })
      const updated = { ...strategy, endDate: today }
      setStrategies(strategies.map((s) => (s.id === strategy.id ? updated : s)))
      setEditing({ focusReview: true, strategy: updated })
    } catch (error) {
      handleError(error)
    }
  }

  const saveWeight = async (weekStart: string) => {
    const value = Number(weightText.replace(',', '.'))
    if (!value || value <= 0 || value >= 500) {
      toast.error('Enter your weekly average in kg, e.g. 84.6')
      return
    }
    try {
      await saveWeeklyWeight(weekStart, value)
      setWeightWeek(null)
      const data = await fetchStrategiesAndWeights()
      setWeights(data.weights)
    } catch (error) {
      handleError(error)
    }
  }

  const removeWeight = async (weight: WeeklyWeight) => {
    try {
      await deleteWeeklyWeight(weight.id)
      setWeightWeek(null)
      setWeights(weights.filter((w) => w.id !== weight.id))
    } catch (error) {
      handleError(error)
    }
  }

  // ---------- tabs ----------
  const renderStrategies = () => (
    <div>
      {editing && (
        <StrategyEditor
          strategy={editing.strategy}
          strategies={strategies}
          today={today}
          focusReview={editing.focusReview}
          onDone={finishEditing}
          onCancel={() => setEditing(undefined)}
        />
      )}

      {!editing && (
        <button
          type="button"
          className="purple bold w100 mb15"
          onClick={() => setEditing({ strategy: null })}
        >
          Start new strategy
        </button>
      )}

      {reviewsDue.length > 0 && !editing && (
        <div className="card" style={{ backgroundColor: colors.yellow }}>
          Time to review{' '}
          {reviewsDue.map((row) => `"${row.strategy.name}"`).join(', ')}. Tap{' '}
          <b>Review</b> to grade it and note what you learned.
        </div>
      )}

      {strategyRows.length > 1 && (
        <div className="toolbar">
          <button
            type="button"
            className={!sortByGrade ? 'selected' : ''}
            onClick={() => setSortByGrade(false)}
          >
            Newest first
          </button>
          <button
            type="button"
            className={sortByGrade ? 'selected' : ''}
            onClick={() => setSortByGrade(true)}
          >
            Best grade first
          </button>
        </div>
      )}

      {strategyRows.length === 0 && !editing && (
        <div className="muted" style={{ lineHeight: 1.6 }}>
          No strategies yet. Start one to compare how different approaches work
          for you: each strategy runs for a period, and you can grade it and
          note what you learned when it ends.
        </div>
      )}

      {strategyRows.map(({ stats, strategy }) => (
        <div className="card" key={strategy.id}>
          <div
            className="fr"
            style={{ justifyContent: 'space-between', gap: 10 }}
          >
            <div className="title">{strategy.name}</div>
            {stats.ongoing ? (
              <span className="badge ongoing">Ongoing</span>
            ) : strategy.grade ? (
              <span className="stars" title={`Grade ${strategy.grade} of 5`}>
                {stars(strategy.grade)}
              </span>
            ) : (
              <span className="badge review">Review due</span>
            )}
          </div>
          <div className="muted mt5">
            {shortDate(strategy.startDate)} –{' '}
            {strategy.endDate ? shortDate(strategy.endDate) : 'now'} ·{' '}
            {stats.daysInPeriod} {stats.daysInPeriod === 1 ? 'day' : 'days'}
          </div>

          <div className="stats">
            <div>
              <div className="muted">Avg calories</div>
              <div className="value">{kcal(stats.avgCalories)}</div>
            </div>
            <div>
              <div className="muted">Avg protein</div>
              <div className="value">{grams(stats.avgProtein)}</div>
            </div>
            <div>
              <div className="muted">Days logged</div>
              <div className="value">
                {stats.daysLogged} / {stats.daysInPeriod}
              </div>
            </div>
            <div>
              <div className="muted">Weight change</div>
              <div className="value">{signedKg(stats.weightChange)}</div>
              {stats.startWeight !== null && stats.endWeight !== null && (
                <div className="muted">
                  {kg(stats.startWeight)} → {kg(stats.endWeight)}
                </div>
              )}
            </div>
          </div>

          {stats.timing.shareByPart && (
            <div className="mt10">
              <div className="muted">Calorie split over the day</div>
              <Distribution
                shares={stats.timing.shareByPart}
                midpoint={stats.timing.avgMidpoint}
                lateDays={stats.timing.lateDays}
                showLegend={true}
              />
            </div>
          )}

          {strategy.planNote && (
            <div className="note">
              <b>Plan:</b> {strategy.planNote}
            </div>
          )}
          {strategy.reviewNote && (
            <div className="note">
              <b>Review:</b> {strategy.reviewNote}
            </div>
          )}

          {!editing && (
            <div className="fr mt15" style={{ gap: 8 }}>
              {stats.ongoing && strategy.endDate === null && (
                <button
                  type="button"
                  className="expand"
                  onClick={() => endNow(strategy)}
                >
                  End today
                </button>
              )}
              <button
                type="button"
                className={`expand ${stats.reviewDue ? 'purple bold' : ''}`}
                onClick={() =>
                  setEditing({ focusReview: stats.reviewDue, strategy })
                }
              >
                {stats.reviewDue ? 'Review' : 'Edit'}
              </button>
            </div>
          )}
        </div>
      ))}

      {weights.length === 0 && strategyRows.length > 0 && (
        <div className="muted mt10">
          Tip: add your weekly average weight under <b>Weeks</b> to see the
          weight change per strategy.
        </div>
      )}
    </div>
  )

  const rangeToolbar = (
    <div className="toolbar">
      {[4, 12, 26, 52].map((n) => (
        <button
          key={n}
          type="button"
          className={weeksBack === n ? 'selected' : ''}
          onClick={() => setWeeksBack(n)}
        >
          {n} weeks
        </button>
      ))}
    </div>
  )

  const renderWeeks = () => (
    <div>
      {rangeToolbar}
      <div className="muted mb10">
        Averages are per logged day. Weight: enter your weekly average (kg).
      </div>
      {weeks.map((week) => {
        const strategy = strategyOn(
          strategies,
          dayjs(week.weekStart).add(3, 'day').format('YYYY-MM-DD')
        )
        return (
          <div className="row" key={week.weekStart}>
            <div>
              <div className="title" style={{ fontSize: '0.95rem' }}>
                Week of {shortDate(week.weekStart)}
              </div>
              <div className="muted">
                {week.daysLogged}/7 days logged
                {strategy && (
                  <>
                    {' '}
                    · <span className="tag">{strategy.name}</span>
                  </>
                )}
              </div>
              <Distribution
                shares={week.timing.shareByPart}
                midpoint={week.timing.avgMidpoint}
                lateDays={week.timing.lateDays}
              />
              {weightWeek === week.weekStart ? (
                <div className="weight-input mt5">
                  <input
                    inputMode="decimal"
                    placeholder="kg"
                    value={weightText}
                    onChange={(e) => setWeightText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveWeight(week.weekStart)
                    }}
                  />
                  <button
                    type="button"
                    className="purple"
                    onClick={() => saveWeight(week.weekStart)}
                  >
                    Save
                  </button>
                  {week.weight && (
                    <button
                      type="button"
                      onClick={() => removeWeight(week.weight as WeeklyWeight)}
                    >
                      Clear
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="empty mt5"
                  style={{ padding: '4px 0', fontSize: '0.85rem' }}
                  onClick={() => {
                    setWeightWeek(week.weekStart)
                    setWeightText(
                      week.weight ? String(week.weight.weightKg) : ''
                    )
                  }}
                >
                  {week.weight
                    ? `⚖ ${kg(week.weight.weightKg)}`
                    : '+ Add weight'}
                </button>
              )}
            </div>
            <div className="numbers">
              <div>{kcal(week.avgCalories)}</div>
              <div className="muted">{grams(week.avgProtein)} protein</div>
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderDays = () => (
    <div>
      {rangeToolbar}
      {daysInRange.length === 0 && (
        <div className="muted">Nothing logged in this period yet.</div>
      )}
      {daysInRange.map((day) => {
        const strategy = strategyOn(strategies, day.day)
        return (
          <div className="row" key={day.day}>
            <div>
              <div className="title" style={{ fontSize: '0.95rem' }}>
                {day.day === today ? 'Today' : longDate(day.day)}
              </div>
              {strategy && <span className="tag">{strategy.name}</span>}
              <Distribution
                shares={summariseTiming([day]).shareByPart}
                midpoint={day.midpointAt}
                lateDays={day.lateEntries > 0 ? 1 : 0}
              />
            </div>
            <div className="numbers">
              <div>{kcal(day.calories)}</div>
              <div className="muted">{grams(day.protein)} protein</div>
              {day.burned > 0 && (
                <div className="muted">−{kcal(day.burned)} exercise</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div css={container}>
      <Tabs
        selected={tab}
        onSelect={(selected) => {
          setTab((selected || 'strategies') as Tab)
          setEditing(undefined)
        }}
        className="mb20"
        tabs={{
          strategies: { image: '', title: 'Strategies' },
          weeks: { image: '', title: 'Weeks' },
          days: { image: '', title: 'Days' },
        }}
      />
      {loading && days.length === 0 && strategies.length === 0 ? (
        <div className="fcc" style={{ padding: 40 }}>
          <Spinner color={colors.purple} />
        </div>
      ) : (
        <>
          {tab === 'strategies' && renderStrategies()}
          {tab === 'weeks' && renderWeeks()}
          {tab === 'days' && renderDays()}
        </>
      )}
    </div>
  )
}
