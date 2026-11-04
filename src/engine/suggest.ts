import { effectiveLoad, rpeToRir, setE1rm } from './e1rm';
import { weightFromE1rm } from './prescribe';
import type { ExerciseDef, PrescriptionKind, Unit } from './types';
import { formatNumber, formatSigned, minLoad } from './units';

export interface SuggestInput {
  set: { weight: number; reps: number; rpe?: number | null };
  /** Prescription kind of the set just completed. */
  kind: PrescriptionKind;
  exercise: Pick<ExerciseDef, 'equipment' | 'increment'>;
  repMin: number;
  repMax: number;
  targetReps: number;
  targetRIR: number;
  bodyweight: number;
  unit: Unit;
}

export interface Suggestion {
  /** Weight to prefill for the next set. */
  weight: number;
  change: 'up' | 'down' | 'same' | 'recalibrated';
  /** One-line note shown under the weight tile; null when nothing changed. */
  message: string | null;
}

/**
 * In-session adjustment after a completed set.
 * - Calibration set: the next weight comes from that set's e1RM at the current target.
 * - reps ≥ repMax AND RIR ≥ 2 → +1 increment; reps < repMin OR (RIR 0 AND reps < target) → −1 increment.
 * - With no RPE (accessories), only the rep conditions apply.
 */
export function suggestNextWeight(input: SuggestInput): Suggestion {
  const { set, kind, exercise, repMin, repMax, targetReps, targetRIR, bodyweight, unit } = input;
  const inc = exercise.increment;
  const hasRpe = set.rpe != null;
  const rir = rpeToRir(set.rpe);

  if (kind === 'calibration' && set.reps > 0) {
    const e = setE1rm(effectiveLoad(exercise.equipment, set.weight, bodyweight), set.reps, rir);
    const weight = weightFromE1rm(e, targetReps, targetRIR, exercise, bodyweight, unit);
    return {
      weight,
      change: 'recalibrated',
      message: `${formatNumber(weight)} ${unit} for your next set, based on that calibration set (e1RM ${formatNumber(e, 1)} ${unit})`,
    };
  }

  const up = set.reps >= repMax && (!hasRpe || rir >= 2);
  const down = set.reps < repMin || (hasRpe && rir === 0 && set.reps < targetReps);

  if (up) {
    return {
      weight: set.weight + inc,
      change: 'up',
      message: `Suggested ${formatSigned(inc, unit)} — that looked easy`,
    };
  }
  if (down && set.weight - inc >= minLoad(exercise.equipment, unit)) {
    return {
      weight: set.weight - inc,
      change: 'down',
      message: `Suggested ${formatSigned(-inc, unit)} — that was too heavy`,
    };
  }
  return { weight: set.weight, change: 'same', message: null };
}
