import { buildExerciseLibrary, buildSeedProgram } from '../data/library';
import type { ExerciseDef, ExerciseState, FinishInput, LoggedSet, SlotDef, SlotState } from './index';

export const lib = Object.fromEntries(buildExerciseLibrary('kg').map((e) => [e.id, e])) as Record<string, ExerciseDef>;
export const days = buildSeedProgram();
export const allSlots: SlotDef[] = days.flatMap((d) => d.slots);
export const slotById = (id: string) => allSlots.find((s) => s.slotId === id)!;

export const exState = (exerciseId: string, e1rm: number, extra: Partial<ExerciseState> = {}): ExerciseState => ({
  exerciseId,
  e1rm,
  missCount: 0,
  accessoryFailCount: 0,
  updatedAt: 1,
  sessionCount: 3,
  ...extra,
});

export const slotState = (slotId: string, weight: number, extra: Partial<SlotState> = {}): SlotState => ({
  slotId,
  lastPrescribedWeight: weight,
  lastPrescribedKind: 'normal',
  nextWeight: weight,
  reason: 'test',
  prescriptionKind: 'normal',
  ...extra,
});

export const set = (slotId: string, setIndex: number, weight: number, reps: number, rpe: number | null = 8, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  slotId,
  exerciseId: slotById(slotId).exerciseId,
  setIndex,
  weight,
  reps,
  rpe,
  ...extra,
});

export function finishInput(over: Partial<FinishInput>): FinishInput {
  return {
    sets: [],
    allSlots,
    exercises: lib,
    exerciseStates: {},
    slotStates: {},
    bodyweight: 80,
    unit: 'kg',
    returnPhase: { active: false, sessionsCompleted: 0 },
    now: 1000,
    ...over,
  };
}
