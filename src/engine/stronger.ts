import { sessionE1rm, smoothE1rm } from './e1rm';
import type { E1rmSetInput } from './e1rm';
import type { ExerciseDef, ExerciseState } from './types';

export interface StrongerCheck {
  oldE1rm: number;
  provisional: number;
  delta: number;
}

/**
 * "You're getting stronger": provisional smoothed e1RM as if the session ended now.
 * Fires when it beats the stored value by ≥ 1 increment. Never on an exercise's first logged
 * session. The caller tracks "already shown for this exercise this session".
 */
export function checkGettingStronger(input: {
  exercise: Pick<ExerciseDef, 'equipment' | 'increment'>;
  state?: ExerciseState;
  setsSoFar: E1rmSetInput[];
  bodyweight: number;
  returnActive: boolean;
  alreadyShown?: boolean;
}): StrongerCheck | null {
  const { exercise, state, setsSoFar, bodyweight, returnActive, alreadyShown } = input;
  if (alreadyShown || !state || state.sessionCount === 0) return null;
  const session = sessionE1rm(exercise.equipment, setsSoFar, bodyweight);
  if (session == null) return null;
  const provisional = smoothE1rm(state.e1rm, session, returnActive);
  const delta = provisional - state.e1rm;
  // small epsilon so a delta of exactly one increment counts
  if (delta + 1e-9 < exercise.increment) return null;
  return { oldE1rm: state.e1rm, provisional, delta };
}
