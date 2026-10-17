import {
  calculateStrategyStats,
  dayKey,
  historyStartDate,
  planNewStrategy,
  type Strategy,
  summariseDays,
  summariseWeeks,
  type WeeklyWeight,
  weekStartOf,
} from './computeHistory'

const entry = (
  createdAt: string,
  calories: number,
  protein = 0,
  burned = 0
) => ({
  burned,
  calories,
  createdAt,
  protein,
})

const strategy = (overrides: Partial<Strategy>): Strategy => ({
  endDate: null,
  grade: null,
  id: 's1',
  name: 'Less fruit',
  planNote: null,
  reviewNote: null,
  startDate: '2026-10-19',
  ...overrides,
})

describe('dayKey', () => {
  it('uses the calendar day by default', () => {
    expect(dayKey('2026-10-19T12:00:00')).toBe('2026-10-19')
  })
  it('respects a later day start time', () => {
    // 01:30 belongs to the previous day when the day starts at 04:00
    expect(dayKey('2026-10-20T01:30:00', '04:00:00')).toBe('2026-10-19')
    expect(dayKey('2026-10-20T04:30:00', '04:00:00')).toBe('2026-10-20')
  })
})

describe('weekStartOf', () => {
  it('returns the Monday of the week', () => {
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19') // Monday
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19') // Sunday
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26') // next Monday
  })
})

describe('summariseDays', () => {
  it('adds up entries per day, newest first', () => {
    const days = summariseDays([
      entry('2026-10-19T08:00:00', 300, 20),
      entry('2026-10-19T19:00:00', 700, 40),
      entry('2026-10-20T12:00:00', 500, 30),
    ])
    expect(days).toEqual([
      { burned: 0, calories: 500, day: '2026-10-20', entries: 1, protein: 30 },
      { burned: 0, calories: 1000, day: '2026-10-19', entries: 2, protein: 60 },
    ])
  })
})

describe('summariseWeeks', () => {
  it('averages over logged days only and attaches the weight', () => {
    const days = summariseDays([
      entry('2026-10-19T08:00:00', 2000, 100),
      entry('2026-10-21T08:00:00', 1600, 140),
    ])
    const weights: WeeklyWeight[] = [
      { id: 'w1', weekStart: '2026-10-19', weightKg: 84.2 },
      { id: 'w0', weekStart: '2026-10-12', weightKg: 84.9 },
    ]
    const weeks = summariseWeeks(days, weights)
    expect(weeks[0]).toEqual({
      avgCalories: 1800,
      avgProtein: 120,
      daysLogged: 2,
      weekStart: '2026-10-19',
      weight: weights[0],
    })
    // A week with only a weight still shows up
    expect(weeks[1].weekStart).toBe('2026-10-12')
    expect(weeks[1].daysLogged).toBe(0)
    expect(weeks[1].avgCalories).toBeNull()
  })
})

describe('calculateStrategyStats', () => {
  const weights: WeeklyWeight[] = [
    { id: 'w0', weekStart: '2026-10-12', weightKg: 85.0 },
    { id: 'w1', weekStart: '2026-10-19', weightKg: 84.6 },
    { id: 'w2', weekStart: '2026-10-26', weightKg: 84.1 },
  ]
  const days = summariseDays([
    entry('2026-10-18T12:00:00', 2500), // before the strategy
    entry('2026-10-19T12:00:00', 1800, 120),
    entry('2026-10-20T12:00:00', 2000, 140),
    entry('2026-11-02T12:00:00', 2200), // after the strategy
  ])

  it('compares the week before with the last week of a finished strategy', () => {
    const stats = calculateStrategyStats(
      strategy({ endDate: '2026-11-01' }),
      days,
      weights,
      '2026-11-05'
    )
    expect(stats.daysInPeriod).toBe(14)
    expect(stats.daysLogged).toBe(2)
    expect(stats.avgCalories).toBe(1900)
    expect(stats.avgProtein).toBe(130)
    expect(stats.startWeight).toBe(85.0)
    expect(stats.endWeight).toBe(84.1)
    expect(stats.weightChange).toBe(-0.9)
    expect(stats.ongoing).toBe(false)
    expect(stats.reviewDue).toBe(true)
  })

  it('treats an open-ended strategy as ongoing up to today', () => {
    const stats = calculateStrategyStats(
      strategy({}),
      days,
      weights,
      '2026-10-21'
    )
    expect(stats.ongoing).toBe(true)
    expect(stats.reviewDue).toBe(false)
    expect(stats.daysInPeriod).toBe(3)
    expect(stats.weightChange).toBe(-0.4)
  })

  it('shows no weight change without a later weigh-in', () => {
    const stats = calculateStrategyStats(
      strategy({}),
      days,
      [weights[0]],
      '2026-10-21'
    )
    expect(stats.startWeight).toBe(85.0)
    expect(stats.weightChange).toBeNull()
  })

  it('is not due for review once graded', () => {
    const stats = calculateStrategyStats(
      strategy({ endDate: '2026-11-01', grade: 4 }),
      days,
      weights,
      '2026-11-05'
    )
    expect(stats.reviewDue).toBe(false)
  })
})

describe('historyStartDate', () => {
  it('goes back far enough for the oldest strategy', () => {
    expect(
      historyStartDate(
        [strategy({ startDate: '2026-01-05' })],
        12,
        '2026-10-21'
      )
    ).toBe('2026-01-05')
  })
  it('otherwise uses the requested number of weeks', () => {
    expect(historyStartDate([], 4, '2026-10-21')).toBe('2026-09-28')
  })
})

describe('planNewStrategy', () => {
  it('closes the ongoing strategy the day before the new one', () => {
    expect(planNewStrategy([strategy({})], '2026-10-26')).toEqual({
      close: { endDate: '2026-10-25', id: 's1' },
      error: null,
    })
  })
  it('refuses a start date on or before the ongoing strategy', () => {
    expect(planNewStrategy([strategy({})], '2026-10-19').error).toBeTruthy()
  })
  it('refuses a start date inside a finished strategy', () => {
    expect(
      planNewStrategy([strategy({ endDate: '2026-10-25' })], '2026-10-22').error
    ).toBeTruthy()
  })
  it('allows the first strategy', () => {
    expect(planNewStrategy([], '2026-10-19')).toEqual({
      close: null,
      error: null,
    })
  })
})
