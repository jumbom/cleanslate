import { gql } from '../helpers/gql'

// Note: the gql helper keeps only the literal text (no ${} interpolation),
// so fragments are appended with plain string concatenation below.

const STRATEGY_FRAGMENT = gql`
  fragment strategy on strategies {
    id
    name
    startDate
    endDate
    planNote
    grade
    reviewNote
    createdAt
    updatedAt
  }
`

const WEEKLY_WEIGHT_FRAGMENT = gql`
  fragment weekly_weight on weekly_weights {
    id
    weekStart
    weightKg
  }
`

// Strategies and weights are small, so we always load all of them
export const GET_STRATEGIES_AND_WEIGHTS =
  gql`
    query GET_STRATEGIES_AND_WEIGHTS {
      strategies(order_by: { startDate: desc }) {
        ...strategy
      }
      weekly_weights(order_by: { weekStart: desc }) {
        ...weekly_weight
      }
    }
  ` +
  STRATEGY_FRAGMENT +
  WEEKLY_WEIGHT_FRAGMENT

// Every log is kept in the database; the main screen only asks for today.
// History asks for a longer range. Use with stringifyQuery (log fragments).
export const GET_HISTORY_LOGS = gql`
  query GET_HISTORY_LOGS($start: timestamptz!, $end: timestamptz!) {
    logs(where: { createdAt: { _gte: $start, _lt: $end } }) {
      ...log
    }
    quick_logs(where: { createdAt: { _gte: $start, _lt: $end } }) {
      ...quick_log
    }
    exercise_logs(where: { createdAt: { _gte: $start, _lt: $end } }) {
      ...exercise_log
    }
  }
`

export const INSERT_STRATEGY =
  gql`
    mutation INSERT_STRATEGY($object: strategies_insert_input!) {
      insert_strategies_one(object: $object) {
        ...strategy
      }
    }
  ` + STRATEGY_FRAGMENT

export const UPDATE_STRATEGY =
  gql`
    mutation UPDATE_STRATEGY($id: uuid!, $set: strategies_set_input!) {
      update_strategies_by_pk(pk_columns: { id: $id }, _set: $set) {
        ...strategy
      }
    }
  ` + STRATEGY_FRAGMENT

export const DELETE_STRATEGY = gql`
  mutation DELETE_STRATEGY($id: uuid!) {
    delete_strategies_by_pk(id: $id) {
      id
    }
  }
`

export const UPSERT_WEEKLY_WEIGHT =
  gql`
    mutation UPSERT_WEEKLY_WEIGHT($object: weekly_weights_insert_input!) {
      insert_weekly_weights_one(
        object: $object
        on_conflict: {
          constraint: weekly_weights_profile_week_key
          update_columns: [weightKg]
        }
      ) {
        ...weekly_weight
      }
    }
  ` + WEEKLY_WEIGHT_FRAGMENT

export const DELETE_WEEKLY_WEIGHT = gql`
  mutation DELETE_WEEKLY_WEIGHT($id: uuid!) {
    delete_weekly_weights_by_pk(id: $id) {
      id
    }
  }
`
