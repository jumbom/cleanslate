import dayjs from 'dayjs'

/** One logged item, already converted to calories and protein */
export type HistoryEntry = {
  createdAt: string
  calories: number
  protein: number
  burned: number
}

export type DaySummary = {
  day: string // YYYY-MM-DD
  calories: number
  protein: number
  burned: number
  entries: number
  // How the day's calories were spread over the eating window
  caloriesByPart: [number, number, number] // morning, midday, afternoon
  midpointAt: number | null // minutes after midnight when half was eaten
  lateEntries: number // food logged after the eating cut-off (16:00)
}

/** Distribution of calories over a set of days */
export type TimingSummary = {
  shareByPart: [number, number, number] | null // 0..1 per part of the day
  avgMidpoint: number | null
  lateDays: number
}

/** Your rule: no food after 16:00. Entries later than this are flagged. */
export const EATING_CUTOFF = 16 * 60
/** Parts of the eating window: morning until 10:00, midday until 13:00, afternoon after */
export const PART_ENDS = [10 * 60, 13 * 60] as const
export const PART_LABELS = ['Until 10:00', '10–13', '13–16'] as const

const partOf = (minutes: number) =>
  minutes < PART_ENDS[0] ? 0 : minutes < PART_ENDS[1] ? 1 : 2

export type WeeklyWeight = {
  id: string
  weekStart: string // YYYY-MM-DD, always a Monday
  weightKg: number
}

export type WeekSummary = {
  weekStart: string
  daysLogged: number
  avgCalories: number | null
  avgProtein: number | null
  weight: WeeklyWeight | null
  timing: TimingSummary
}

export type Strategy = {
  id: string
  name: string
  startDate: string
  endDate: string | null
  planNote: string | null
  grade: number | null
  reviewNote: string | null
}

export type StrategyStats = {
  daysInPeriod: number
  daysLogged: number
  avgCalories: number | null
  avgProtein: number | null
  startWeight: number | null
  endWeight: number | null
  weightChange: number | null
  reviewDue: boolean
  ongoing: boolean
  timing: TimingSummary
}

const FORMAT = 'YYYY-MM-DD'

/**
 * Which day an entry belongs to. Clean Slate lets you choose when your day
 * starts (profile.startTime, e.g. 04:00), so a snack at 01:00 can still count
 * for the previous day. We apply the same rule here.
 */
export const dayKey = (createdAt: string | Date, startTime = '00:00:00') => {
  const [hour, minute] = startTime.split(':').map(Number)
  return dayjs(createdAt)
    .subtract(hour || 0, 'hour')
    .subtract(minute || 0, 'minute')
    .format(FORMAT)
}

/** Monday of the week containing `day` (European weeks) */
export const weekStartOf = (day: string) => {
  const date = dayjs(day)
  return date.subtract((date.day() + 6) % 7, 'day').format(FORMAT)
}

/** Minutes after midnight; entries before the day start belong to the day before */
const minutesOfDay = (createdAt: string, startTime: string) => {
  const [hour, minute] = startTime.split(':').map(Number)
  const date = dayjs(createdAt)
  const minutes = date.hour() * 60 + date.minute()
  const dayStart = (hour || 0) * 60 + (minute || 0)
  return minutes < dayStart ? minutes + 24 * 60 : minutes
}

export const summariseDays = (
  entries: HistoryEntry[],
  startTime = '00:00:00'
): DaySummary[] => {
  const days = new Map<string, DaySummary>()
  const foodTimes = new Map<string, { at: number; calories: number }[]>()
  for (const entry of entries) {
    const day = dayKey(entry.createdAt, startTime)
    const summary: DaySummary = days.get(day) || {
      burned: 0,
      calories: 0,
      caloriesByPart: [0, 0, 0],
      day,
      entries: 0,
      lateEntries: 0,
      midpointAt: null,
      protein: 0,
    }
    summary.calories += entry.calories
    summary.protein += entry.protein
    summary.burned += entry.burned
    summary.entries += 1

    if (entry.calories > 0) {
      const at = minutesOfDay(entry.createdAt, startTime)
      foodTimes.set(day, [
        ...(foodTimes.get(day) || []),
        { at, calories: entry.calories },
      ])
      summary.caloriesByPart[partOf(at)] += entry.calories
      if (at >= EATING_CUTOFF) summary.lateEntries += 1
    }
    days.set(day, summary)
  }

  // The moment half of the day's calories had been eaten
  for (const [day, items] of foodTimes) {
    const summary = days.get(day) as DaySummary
    const sorted = [...items].sort((a, b) => a.at - b.at)
    const half = sorted.reduce((sum, item) => sum + item.calories, 0) / 2
    let eaten = 0
    for (const item of sorted) {
      eaten += item.calories
      if (eaten >= half) {
        summary.midpointAt = item.at
        break
      }
    }
  }

  return [...days.values()].sort((a, b) => b.day.localeCompare(a.day))
}

const average = (values: number[]) =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length

/** Calorie distribution over days that have food entries */
export const summariseTiming = (days: DaySummary[]): TimingSummary => {
  const totals: [number, number, number] = [0, 0, 0]
  for (const day of days) {
    day.caloriesByPart.forEach((calories, i) => {
      totals[i] += calories
    })
  }
  const total = totals[0] + totals[1] + totals[2]
  const midpoints = days
    .map((d) => d.midpointAt)
    .filter((m): m is number => m !== null)
  return {
    avgMidpoint: average(midpoints),
    lateDays: days.filter((d) => d.lateEntries > 0).length,
    shareByPart:
      total > 0
        ? [totals[0] / total, totals[1] / total, totals[2] / total]
        : null,
  }
}

/** Days with at least one food entry or quick add count as "logged" */
const loggedDays = (days: DaySummary[]) =>
  days.filter((day) => day.calories > 0 || day.protein > 0)

export const summariseWeeks = (
  days: DaySummary[],
  weights: WeeklyWeight[]
): WeekSummary[] => {
  const weeks = new Map<string, DaySummary[]>()
  for (const day of loggedDays(days)) {
    const week = weekStartOf(day.day)
    weeks.set(week, [...(weeks.get(week) || []), day])
  }
  // A week with only a weight entry still deserves a row
  for (const weight of weights) {
    if (!weeks.has(weight.weekStart)) {
      weeks.set(weight.weekStart, [])
    }
  }
  return [...weeks.entries()]
    .map(([weekStart, daysInWeek]) => ({
      avgCalories: average(daysInWeek.map((d) => d.calories)),
      avgProtein: average(daysInWeek.map((d) => d.protein)),
      daysLogged: daysInWeek.length,
      timing: summariseTiming(daysInWeek),
      weekStart,
      weight: weights.find((w) => w.weekStart === weekStart) || null,
    }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
}

const findWeight = (weights: WeeklyWeight[], weekStart: string) =>
  weights.find((w) => w.weekStart === weekStart) || null

export const calculateStrategyStats = (
  strategy: Strategy,
  days: DaySummary[],
  weights: WeeklyWeight[],
  today: string
): StrategyStats => {
  const ongoing = strategy.endDate === null || strategy.endDate >= today
  const lastDay =
    strategy.endDate && strategy.endDate < today ? strategy.endDate : today
  const daysInPeriod = Math.max(
    0,
    dayjs(lastDay).diff(dayjs(strategy.startDate), 'day') + 1
  )

  const inPeriod = loggedDays(days).filter(
    (day) => day.day >= strategy.startDate && day.day <= lastDay
  )

  // Weight: compare the week before the strategy started (the baseline)
  // with the last week of the period. Weekly averages, as entered by the user.
  const startWeek = weekStartOf(strategy.startDate)
  const endWeek = weekStartOf(lastDay)
  const previousWeek = dayjs(startWeek).subtract(7, 'day').format(FORMAT)

  const baseline =
    findWeight(weights, previousWeek) || findWeight(weights, startWeek)
  const weightsInPeriod = weights
    .filter((w) => w.weekStart >= startWeek && w.weekStart <= endWeek)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
  const latest = weightsInPeriod[0] || null
  const end = latest && baseline && latest.id !== baseline.id ? latest : null

  return {
    avgCalories: average(inPeriod.map((d) => d.calories)),
    avgProtein: average(inPeriod.map((d) => d.protein)),
    daysInPeriod,
    daysLogged: inPeriod.length,
    endWeight: end ? Number(end.weightKg) : null,
    ongoing,
    reviewDue: !ongoing && strategy.grade === null,
    timing: summariseTiming(inPeriod),
    startWeight: baseline ? Number(baseline.weightKg) : null,
    weightChange:
      end && baseline
        ? Math.round((Number(end.weightKg) - Number(baseline.weightKg)) * 10) /
          10
        : null,
  }
}

/** The earliest date we need logs from, so every strategy can be calculated */
export const historyStartDate = (
  strategies: Strategy[],
  weeksBack: number,
  today: string
) => {
  const byWeeks = dayjs(weekStartOf(today))
    .subtract(weeksBack - 1, 'week')
    .format(FORMAT)
  const earliestStrategy = strategies
    .map((s) => s.startDate)
    .sort()
    .find(Boolean)
  return earliestStrategy && earliestStrategy < byWeeks
    ? earliestStrategy
    : byWeeks
}

/**
 * When a new strategy starts, the ongoing one ends the day before.
 * Returns the strategy to close and its new end date, or an error.
 */
export const planNewStrategy = (
  strategies: Strategy[],
  startDate: string
): { close: { id: string; endDate: string } | null; error: string | null } => {
  const ongoing = strategies.find((s) => s.endDate === null)
  if (!ongoing) {
    const overlapping = strategies.find(
      (s) =>
        s.endDate !== null && startDate <= s.endDate && startDate >= s.startDate
    )
    return overlapping
      ? {
          close: null,
          error: `This date falls inside "${overlapping.name}". Pick a later start date.`,
        }
      : { close: null, error: null }
  }
  if (startDate <= ongoing.startDate) {
    return {
      close: null,
      error: `"${ongoing.name}" started on ${ongoing.startDate}. Pick a later start date, or edit that strategy instead.`,
    }
  }
  return {
    close: {
      endDate: dayjs(startDate).subtract(1, 'day').format(FORMAT),
      id: ongoing.id,
    },
    error: null,
  }
}
