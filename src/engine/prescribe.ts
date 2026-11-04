import { targetRirFor } from './returnPhase';
import type {
  ExerciseDef,
  ExerciseState,
  FamilyId,
  Prescription,
  PrescriptionKind,
  ReturnPhase,
  SlotDef,
  SlotState,
  Unit,
} from './types';
import { floorToIncrement, formatNumber, minLoad } from './units';

export const PREDICTION_HAIRCUT = 0.95;

/** Families whose lifts jump by up to two increments per session. */
const BIG_JUMP_FAMILIES: FamilyId[] = ['squat', 'hinge'];

export function clampIncrements(family: FamilyId): number {
  return BIG_JUMP_FAMILIES.includes(family) ? 2 : 1;
}

/** targetReps / targetRIR for a slot. Main: repMin+1 @ 2 (3 early in return phase). Accessory: repMin @ 2. */
export function targetsFor(
  exercise: Pick<ExerciseDef, 'type'>,
  slot: Pick<SlotDef, 'repMin' | 'repMax'>,
  rp: ReturnPhase,
): { targetReps: number; targetRIR: number } {
  if (exercise.type === 'main') {
    return {
      targetReps: Math.min(slot.repMin + 1, slot.repMax),
      targetRIR: targetRirFor(rp),
    };
  }
  return { targetReps: slot.repMin, targetRIR: 2 };
}

/**
 * e1RM → weight for a rep/RIR target, in logged terms, rounded down to the increment.
 * With `unit`, never below the equipment's minimum (e.g. the empty bar).
 */
export function weightFromE1rm(
  e1rm: number,
  targetReps: number,
  targetRIR: number,
  exercise: Pick<ExerciseDef, 'equipment' | 'increment'>,
  bodyweight: number,
  unit?: Unit,
): number {
  const load = e1rm / (1 + (targetReps + targetRIR) / 30);
  const logged = exercise.equipment === 'bodyweight' ? load - bodyweight : load;
  const w = floorToIncrement(logged, exercise.increment);
  return unit ? Math.max(w, minLoad(exercise.equipment, unit)) : w;
}

/** Clamp a candidate weight to ±(n × increment) of the previous prescription. */
export function clampWeight(
  candidate: number,
  previous: number,
  increment: number,
  n: number,
): { weight: number; clamped: boolean } {
  const lo = previous - n * increment;
  const hi = previous + n * increment;
  const weight = Math.min(Math.max(candidate, lo), hi);
  return { weight, clamped: weight !== candidate };
}

export interface FamilyMember {
  exercise: ExerciseDef;
  state?: ExerciseState;
}

/** Most recently updated family relative that has an e1RM of its own. */
export function pickPredictionSource(
  target: ExerciseDef,
  members: FamilyMember[],
): { exercise: ExerciseDef; state: ExerciseState } | null {
  let best: { exercise: ExerciseDef; state: ExerciseState } | null = null;
  for (const m of members) {
    if (m.exercise.id === target.id || m.exercise.family !== target.family || !m.state) continue;
    if (!best || m.state.updatedAt > best.state.updatedAt) {
      best = { exercise: m.exercise, state: m.state };
    }
  }
  return best;
}

export function predictE1rm(
  source: { exercise: ExerciseDef; state: ExerciseState },
  target: ExerciseDef,
): number {
  return source.state.e1rm * (target.familyRatio / source.exercise.familyRatio) * PREDICTION_HAIRCUT;
}

export function explainerFor(kind: PrescriptionKind, prescription?: Prescription, sourceName?: string, sourceE1rm?: number, unit: Unit = 'kg'): string {
  switch (kind) {
    case 'calibration':
      return 'Calibration set: enter a weight you can lift for the given number of reps. The app will guide you to the right weight in later sets.';
    case 'predicted':
      return `Predicted set: weight predicted from your e1RM of ${formatNumber(sourceE1rm ?? 0, 1)} ${unit} on ${sourceName ?? 'a related movement'}, a related movement.`;
    case 'deload':
      return prescription?.reason ?? 'Deload: lighter work to let your strength rebuild.';
    default:
      return prescription?.reason ?? '';
  }
}

export interface PrescribeInput {
  exercise: ExerciseDef;
  slot: Pick<SlotDef, 'repMin' | 'repMax'>;
  /** Pass only when the slot's own exercise is being trained (not a swap). */
  slotState?: SlotState;
  exerciseState?: ExerciseState;
  familyMembers: FamilyMember[];
  bodyweight: number;
  returnPhase: ReturnPhase;
  unit: Unit;
}

/**
 * The prescription for the next time a slot is trained. Order of precedence:
 * stored slot state → own e1RM (seed / swap) → predicted from a family relative → calibration.
 */
export function prescribe(input: PrescribeInput): Prescription {
  const { exercise, slot, slotState, exerciseState, familyMembers, bodyweight, returnPhase, unit } = input;
  const { targetReps, targetRIR } = targetsFor(exercise, slot, returnPhase);
  const base = { targetReps, targetRIR };

  if (slotState) {
    return {
      ...base,
      weight: slotState.nextWeight,
      kind: slotState.prescriptionKind,
      reason: slotState.reason,
    };
  }

  if (exerciseState) {
    if (exercise.type === 'accessory' && exerciseState.nextWeight != null) {
      return {
        ...base,
        weight: exerciseState.nextWeight,
        kind: 'normal',
        reason: exerciseState.nextReason ?? `${formatNumber(exerciseState.nextWeight)} ${unit}: from your last session`,
      };
    }
    if (exercise.type === 'accessory' && exerciseState.lastWeight != null) {
      return {
        ...base,
        weight: exerciseState.lastWeight,
        kind: exerciseState.calibrateFirst ? 'calibration' : 'normal',
        reason: exerciseState.calibrateFirst
          ? 'Calibration set: checking your remembered weight'
          : `${formatNumber(exerciseState.lastWeight)} ${unit}: your last working weight`,
      };
    }
    const w = weightFromE1rm(exerciseState.e1rm, targetReps, targetRIR, exercise, bodyweight, unit);
    if (exerciseState.calibrateFirst) {
      return {
        ...base,
        weight: w,
        kind: 'calibration',
        reason: `Calibration set: ${formatNumber(w)} ${unit} is your remembered weight, adjusted for time off. Your first set corrects the estimate.`,
      };
    }
    return {
      ...base,
      weight: w,
      kind: 'normal',
      reason: `${formatNumber(w)} ${unit}: from your e1RM of ${formatNumber(exerciseState.e1rm, 1)} ${unit} (${targetReps} reps, ${targetRIR} in reserve)`,
    };
  }

  const source = pickPredictionSource(exercise, familyMembers);
  if (source) {
    const predicted = predictE1rm(source, exercise);
    const w = weightFromE1rm(predicted, targetReps, targetRIR, exercise, bodyweight, unit);
    return {
      ...base,
      weight: w,
      kind: 'predicted',
      predictedFrom: source.exercise.id,
      reason: explainerFor('predicted', undefined, source.exercise.name, source.state.e1rm, unit),
    };
  }

  return {
    ...base,
    weight: null,
    kind: 'calibration',
    reason: explainerFor('calibration'),
  };
}
