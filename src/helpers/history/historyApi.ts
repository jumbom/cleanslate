import dayjs from 'dayjs'
import { calculateMacros } from '../../components/macros/helpers/calculateMacros'
import {
  DELETE_STRATEGY,
  DELETE_WEEKLY_WEIGHT,
  GET_HISTORY_LOGS,
  GET_STRATEGIES_AND_WEIGHTS,
  INSERT_STRATEGY,
  UPDATE_STRATEGY,
  UPSERT_WEEKLY_WEIGHT,
} from '../../graphql/history'
import type { ExerciseLog } from '../../models/exerciseLog'
import type { Log } from '../../models/log'
import type { Profile } from '../../models/profile'
import type { QuickLog } from '../../models/quickLog'
import { getHasuraClient } from '../getHasuraClient'
import { addBasicFoodsToProfile } from '../profile/addBasicFoodsToProfile'
import { stringifyQuery } from '../stringifyQuery'
import type { HistoryEntry, Strategy, WeeklyWeight } from './computeHistory'

const request = async <T>(query: string, variables = {}): Promise<T> => {
  const client = await getHasuraClient()
  return client.request(query, variables) as Promise<T>
}

export const fetchStrategiesAndWeights = async () => {
  const data = await request<{
    strategies: Strategy[]
    weekly_weights: WeeklyWeight[]
  }>(GET_STRATEGIES_AND_WEIGHTS)
  return {
    strategies: data.strategies,
    weights: data.weekly_weights.map((w) => ({
      ...w,
      weightKg: Number(w.weightKg),
    })),
  }
}

/**
 * Load every log from `startDate` until now and convert each one to
 * calories and protein, using the same maths as the main screen.
 * Planned items that were never eaten (consumed = false) are left out.
 */
export const fetchHistoryEntries = async (
  startDate: string,
  profile: Profile
): Promise<HistoryEntry[]> => {
  const [hour, minute] = profile.startTime.split(':').map(Number)
  const start = dayjs(startDate)
    .add(hour || 0, 'hour')
    .add(minute || 0, 'minute')
  const end = dayjs().add(1, 'day')

  const data = await request<{
    logs: Log[]
    quick_logs: QuickLog[]
    exercise_logs: ExerciseLog[]
  }>(stringifyQuery(GET_HISTORY_LOGS), {
    end: end.toISOString(),
    start: start.toISOString(),
  })

  // Basic foods live in the app, not the database, so attach them first
  const { profiles } = addBasicFoodsToProfile([
    { logs: data.logs, recipes: [] } as unknown as Profile,
  ])
  const logs = profiles[0].logs

  const fromLogs = logs
    .filter((log) => log.consumed !== false)
    .map((log) => {
      const [calories, , , protein] = calculateMacros([log], [], [])
      return {
        burned: 0,
        calories,
        createdAt: String(log.createdAt),
        protein,
      }
    })

  const fromQuickLogs = data.quick_logs
    .filter((log) => log.consumed !== false)
    .map((log) => ({
      burned: 0,
      calories: Number(log.calories),
      createdAt: String(log.createdAt),
      protein: Number(log.protein),
    }))

  const fromExercise = data.exercise_logs.map((log) => ({
    burned: Number(log.amount),
    calories: 0,
    createdAt: String(log.createdAt),
    protein: 0,
  }))

  return [...fromLogs, ...fromQuickLogs, ...fromExercise]
}

export type StrategyInput = {
  name: string
  startDate: string
  endDate: string | null
  planNote: string | null
  grade: number | null
  reviewNote: string | null
}

export const insertStrategy = (object: StrategyInput) =>
  request(INSERT_STRATEGY, { object })

export const updateStrategy = (id: string, set: Partial<StrategyInput>) =>
  request(UPDATE_STRATEGY, { id, set })

export const deleteStrategy = (id: string) => request(DELETE_STRATEGY, { id })

export const saveWeeklyWeight = (weekStart: string, weightKg: number) =>
  request(UPSERT_WEEKLY_WEIGHT, { object: { weekStart, weightKg } })

export const deleteWeeklyWeight = (id: string) =>
  request(DELETE_WEEKLY_WEIGHT, { id })
