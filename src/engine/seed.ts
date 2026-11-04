import type { ExerciseDef, ExerciseState } from './types';
import { floorToIncrement } from './units';

export type TimeAgo = 'under-1' | '1-3' | '3-6' | '6-plus';

export const DETRAINING: Record<TimeAgo, number> = {
  'under-1': 1.0,
  '1-3': 0.95,
  '3-6': 0.9,
  '6-plus': 0.85,
};

/** Remembered weight × reps (assume RIR 1) × detraining factor. */
export function seedE1rm(
  exercise: Pick<ExerciseDef, 'equipment'>,
  weight: number,
  reps: number,
  ago: TimeAgo,
  bodyweight: number,
): number {
  const load = exercise.equipment === 'bodyweight' ? Math.max(0, bodyweight + weight) : weight;
  return load * (1 + (reps + 1) / 30) * DETRAINING[ago];
}

/** Builds the exerciseState (and accessory starting weight) for an onboarding seed. */
export function seedExercise(
  exercise: ExerciseDef,
  weight: number,
  reps: number,
  ago: TimeAgo,
  bodyweight: number,
  now: number,
): ExerciseState {
  const state: ExerciseState = {
    exerciseId: exercise.id,
    e1rm: seedE1rm(exercise, weight, reps, ago, bodyweight),
    missCount: 0,
    accessoryFailCount: 0,
    updatedAt: now,
    sessionCount: 0,
    calibrateFirst: ago === '3-6' || ago === '6-plus',
  };
  if (exercise.type === 'accessory') {
    state.lastWeight = floorToIncrement(weight * DETRAINING[ago], exercise.increment);
  }
  return state;
}
