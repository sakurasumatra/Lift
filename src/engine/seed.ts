import type { ExerciseDef, ExerciseState } from './types';
import { effectiveLoad } from './e1rm';
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
  return effectiveLoad(exercise.equipment, weight, bodyweight) * (1 + (reps + 1) / 30) * DETRAINING[ago];
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
    // Bodyweight lifts detrain on effective load: assisted −20 kg at 80 kg becomes −29 kg (more help), not −17.
    const start = exercise.equipment === 'bodyweight'
      ? effectiveLoad('bodyweight', weight, bodyweight) * DETRAINING[ago] - bodyweight
      : weight * DETRAINING[ago];
    state.lastWeight = floorToIncrement(start, exercise.increment);
  }
  return state;
}
