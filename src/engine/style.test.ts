import { describe, expect, it } from 'vitest';
import {
  finishSessionState, isMaxStyle, prescribe, seedExercise, setsForMain, targetsFor, type ExerciseDef, type SlotDef,
} from './index';
import { allSlots, exState, finishInput, lib, set, slotById, slotState } from './testkit';

const off = { active: false, sessionsCompleted: 0 };
const ret = (n = 0) => ({ active: true, sessionsCompleted: n });
const withStyle = (slot: SlotDef, progressionStyle: SlotDef['progressionStyle']): SlotDef => ({ ...slot, progressionStyle });
const slotsWith = (patch: Record<string, SlotDef['progressionStyle']>) => allSlots.map((s) => (patch[s.slotId] ? withStyle(s, patch[s.slotId]) : s));

describe('the slot’s progression style decides how it progresses, not the exercise or its name', () => {
  it('targets: estimated max = repMin+1 (RIR 3 early in the return phase); reps first = repMin @ RIR 2 always', () => {
    const max = withStyle(slotById('B3'), 'estimatedMax'); // lat pulldown 8–12
    const reps = withStyle(slotById('A1'), 'repsFirst'); // back squat 4–6
    expect(targetsFor(max, off)).toEqual({ targetReps: 9, targetRIR: 2 });
    expect(targetsFor(max, ret(0))).toEqual({ targetReps: 9, targetRIR: 3 });
    expect(targetsFor(reps, off)).toEqual({ targetReps: 4, targetRIR: 2 });
    expect(targetsFor(reps, ret(0))).toEqual({ targetReps: 4, targetRIR: 2 });
  });

  it('the one-set-fewer rule of the return phase applies to estimated-max slots only', () => {
    expect(isMaxStyle(slotById('A1'))).toBe(true);
    expect(isMaxStyle(slotById('B3'))).toBe(false);
    expect(isMaxStyle(withStyle(slotById('B3'), 'estimatedMax'))).toBe(true);
    expect(setsForMain(4, ret(0))).toBe(3);
  });

  it('a reps-first bench slot uses double progression: all sets at repMax → +1 increment, no e1RM prescription', () => {
    const slots = slotsWith({ A2: 'repsFirst' }); // bench 6–8
    const r = finishSessionState(finishInput({
      allSlots: slots,
      exerciseStates: { 'bench-press': exState('bench-press', 120) },
      slotStates: { A2: slotState('A2', 70) },
      sets: [0, 1, 2].map((i) => set('A2', i, 70, 8, null)),
    }));
    expect(r.slotStates.A2.nextWeight).toBe(72.5); // +1 increment, although 120 kg e1RM would suggest far more
    expect(r.slotStates.A2.reason).toMatch(/reached 8 reps/);
  });

  it('an estimated-max lat pulldown slot is prescribed from its e1RM and clamped to ±1 increment', () => {
    const slots = slotsWith({ B3: 'estimatedMax' });
    const r = finishSessionState(finishInput({
      allSlots: slots,
      exerciseStates: { 'lat-pulldown': exState('lat-pulldown', 100) },
      slotStates: { B3: slotState('B3', 60) },
      sets: [0, 1, 2].map((i) => set('B3', i, 60, 12, 8)),
    }));
    // e1RM jumps (12 reps @ RIR 2 at 60 kg → 84), but the prescription may move only one increment from 60
    expect(r.slotStates.B3.nextWeight).toBe(62.5);
    expect(r.slotStates.B3.reason).toMatch(/limited to ±1 increment/);
  });

  it('misses and deloads follow estimated-max slots: a reps-first slot never deloads, an estimated-max one does', () => {
    const run = (style: SlotDef['progressionStyle']) => {
      let ex = { 'lat-pulldown': exState('lat-pulldown', 100, { missCount: 1 }) };
      const slots = slotsWith({ B3: style });
      return finishSessionState(finishInput({
        allSlots: slots, exerciseStates: ex, slotStates: { B3: slotState('B3', 60) },
        sets: [0, 1, 2].map((i) => set('B3', i, 40, 8, 8)), // way below 98% of 100
      }));
    };
    const max = run('estimatedMax');
    expect(max.deloaded).toEqual(['lat-pulldown']);
    expect(max.slotStates.B3).toMatchObject({ prescriptionKind: 'deload', nextWeight: 35 });
    const reps = run('repsFirst');
    expect(reps.deloaded).toEqual([]);
    expect(reps.exerciseStates['lat-pulldown'].missCount).toBe(1);
  });

  it('one exercise in two slots with different styles: one e1RM, each slot progresses its own way', () => {
    // Bench: A2 (6–8) reps-first, B1 (4–6) estimated max. Trained in A2 only today.
    const slots = slotsWith({ A2: 'repsFirst' });
    const r = finishSessionState(finishInput({
      allSlots: slots,
      exerciseStates: { 'bench-press': exState('bench-press', 100) },
      slotStates: { A2: slotState('A2', 70), B1: slotState('B1', 80) },
      sets: [0, 1, 2].map((i) => set('A2', i, 70, 8, 8)),
    }));
    expect(r.exerciseStates['bench-press'].sessionCount).toBe(4);
    expect(r.slotStates.A2.nextWeight).toBe(72.5); // double progression
    // B1 is estimated max and gets re-derived from the updated e1RM, clamped to ±1 increment of its last prescription
    expect(r.slotStates.B1.nextWeight).toBeGreaterThanOrEqual(77.5);
    expect(r.slotStates.B1.nextWeight).toBeLessThanOrEqual(82.5);
  });

  it('a swapped-in exercise follows the slot’s style: reps-first slots double-progress it on its own state', () => {
    const slots = slotsWith({ A2: 'repsFirst' });
    const r = finishSessionState(finishInput({
      allSlots: slots,
      exerciseStates: { 'dumbbell-bench-press': exState('dumbbell-bench-press', 50) },
      slotStates: { A2: slotState('A2', 70) },
      sets: [0, 1, 2].map((i) => ({ ...set('A2', i, 30, 8, null), exerciseId: 'dumbbell-bench-press' })),
    }));
    expect(r.exerciseStates['dumbbell-bench-press'].nextWeight).toBe(32); // +1 dumbbell increment
    expect(r.slotStates.A2).toBeUndefined(); // the slot itself is left alone
  });
});

describe('prescriptions for any exercise in any slot', () => {
  const members = [{ exercise: lib['bench-press'], state: exState('bench-press', 100) }];
  const custom = (over: Partial<ExerciseDef> = {}): ExerciseDef => ({
    id: 'custom-x', name: 'X', equipment: 'barbell', increment: 2.5, primaryMuscle: 'chest', defaultProgressionStyle: 'repsFirst', isCustom: true, ...over,
  });
  const slot = withStyle(slotById('A2'), 'repsFirst');

  it('an exercise with no state, no family and no relatives gets a calibration set', () => {
    const p = prescribe({ exercise: custom(), slot, familyMembers: members, bodyweight: 80, returnPhase: off, unit: 'kg' });
    expect(p).toMatchObject({ kind: 'calibration', weight: null });
  });

  it('a family-less exercise is never used as, or predicted from, another’s source', () => {
    const lone = custom({ id: 'custom-y', family: undefined });
    const members2 = [...members, { exercise: lone, state: exState('custom-y', 200, { updatedAt: 99 }) }];
    const p = prescribe({ exercise: lib['dumbbell-bench-press'], slot, familyMembers: members2, bodyweight: 80, returnPhase: off, unit: 'kg' });
    expect(p).toMatchObject({ kind: 'predicted', predictedFrom: 'bench-press' });
  });

  it('a custom exercise with a family and ratio is predicted like a built-in one', () => {
    const e = custom({ family: 'horizontal-press', familyRatio: 0.5 });
    const p = prescribe({ exercise: e, slot, familyMembers: members, bodyweight: 80, returnPhase: off, unit: 'kg' });
    // 100 × 0.5 × 0.95 = 47.5 → repsFirst target repMin 6 @ RIR 2 → /(1 + 8/30) = 37.5
    expect(p).toMatchObject({ kind: 'predicted', predictedFrom: 'bench-press', weight: 37.5 });
  });
});

describe('seeding is style-agnostic', () => {
  it('records the remembered weight for any exercise, so a reps-first slot can start from it', () => {
    const bench = seedExercise(lib['bench-press'], 60, 5, '1-3', 80, 1);
    expect(bench.lastWeight).toBe(55); // 60 × 0.95 = 57 → floor to 2.5
    const rx = prescribe({
      exercise: lib['bench-press'], slot: withStyle(slotById('A2'), 'repsFirst'), exerciseState: bench,
      familyMembers: [], bodyweight: 80, returnPhase: off, unit: 'kg',
    });
    expect(rx).toMatchObject({ weight: 55, kind: 'normal' });
    const rxMax = prescribe({
      exercise: lib['bench-press'], slot: slotById('A2'), exerciseState: bench,
      familyMembers: [], bodyweight: 80, returnPhase: off, unit: 'kg',
    });
    expect(rxMax.reason).toMatch(/from your e1RM/); // an estimated-max slot still works from the e1RM
  });
});
