import { describe, expect, it } from 'vitest';
import {
  clampWeight, clampIncrements, nextMainPrescription, predictE1rm, prescribe, seedE1rm, seedExercise,
  targetsFor, weightFromE1rm,
} from './index';
import { exState, lib, slotById, slotState } from './testkit';

const off = { active: false, sessionsCompleted: 0 };
const ret = (n = 0) => ({ active: true, sessionsCompleted: n });

describe('targets and weights', () => {
  it('main: repMin+1 at RIR 2; RIR 3 in return sessions 1–6 only', () => {
    const slot = slotById('A1'); // 4–6
    expect(targetsFor(slot, off)).toEqual({ targetReps: 5, targetRIR: 2 });
    expect(targetsFor(slot, ret(0))).toEqual({ targetReps: 5, targetRIR: 3 });
    expect(targetsFor(slot, ret(5))).toEqual({ targetReps: 5, targetRIR: 3 });
    expect(targetsFor(slot, ret(6))).toEqual({ targetReps: 5, targetRIR: 2 });
  });
  it('accessory: repMin at RIR 2', () => {
    expect(targetsFor(slotById('B3'), ret(0))).toEqual({ targetReps: 8, targetRIR: 2 });
  });
  it('weight = e1RM / (1 + (reps+RIR)/30), rounded down', () => {
    // 130 / (1 + 7/30) = 105.4 → 105
    expect(weightFromE1rm(130, 5, 2, lib['back-squat'], 80)).toBe(105);
  });
  it('bodyweight lifts return added load, not effective load', () => {
    // e1RM 130 effective; 130/(1+(8+2)/30) = 97.5 effective → 17.5 added at 80 kg bodyweight
    expect(weightFromE1rm(130, 8, 2, lib['pull-up'], 80)).toBe(17.5);
    // weaker lifter: 90 eff e1RM → 67.5 effective → −12.5 (assistance)
    expect(weightFromE1rm(90, 8, 2, lib['pull-up'], 80)).toBe(-12.5);
    // 88 → 66 effective → −14 → rounds DOWN to −15
    expect(weightFromE1rm(88, 8, 2, lib['pull-up'], 80)).toBe(-15);
  });
  it('rounds in lb', () => {
    const bench = { ...lib['bench-press'], increment: 5 };
    expect(weightFromE1rm(300, 5, 2, bench, 180)).toBe(240); // 243.2 → 240
  });
});

describe('clamps', () => {
  it('±2 increments for squat and hinge, ±1 for everything else', () => {
    expect(clampIncrements('squat')).toBe(2);
    expect(clampIncrements('hinge')).toBe(2);
    expect(clampIncrements('horizontal-press')).toBe(1);
    expect(clampWeight(120, 100, 2.5, 2)).toEqual({ weight: 105, clamped: true });
    expect(clampWeight(120, 100, 2.5, 1)).toEqual({ weight: 102.5, clamped: true });
    expect(clampWeight(80, 100, 2.5, 1)).toEqual({ weight: 97.5, clamped: true });
    expect(clampWeight(101, 100, 2.5, 1)).toEqual({ weight: 101, clamped: false });
  });
  it('nextMainPrescription clamps against the slot’s baseline', () => {
    const base = { exercise: lib['bench-press'], slot: slotById('A2'), returnPhase: off, bodyweight: 80, unit: 'kg' as const };
    const r = nextMainPrescription({ ...base, e1rm: 140, baseline: 80, baselineKind: 'normal' });
    expect(r.weight).toBe(82.5);
    expect(r.reason).toContain('+2.5 kg');
    expect(r.reason).toContain('limited');
    const squat = nextMainPrescription({ ...base, exercise: lib['back-squat'], slot: slotById('A1'), e1rm: 200, baseline: 100, baselineKind: 'normal' });
    expect(squat.weight).toBe(105);
  });
  it('a calibration or predicted baseline is a guess: no clamp', () => {
    const base = { exercise: lib['bench-press'], slot: slotById('A2'), returnPhase: off, bodyweight: 80, unit: 'kg' as const, e1rm: 140 };
    expect(nextMainPrescription({ ...base, baseline: 40, baselineKind: 'calibration' }).weight).toBeGreaterThan(100);
    expect(nextMainPrescription({ ...base, baseline: 40, baselineKind: 'predicted' }).weight).toBeGreaterThan(100);
  });
  it('predicted and calibration prescriptions are never clamped', () => {
    const p = prescribe({
      exercise: lib['leg-press'], slot: slotById('B4'), exerciseState: undefined,
      familyMembers: [{ exercise: lib['back-squat'], state: exState('back-squat', 150) }],
      bodyweight: 80, returnPhase: off, unit: 'kg',
    });
    expect(p.kind).toBe('predicted');
  });
});

describe('predictions', () => {
  it('from the anchor: e1RM × (ratio_t / ratio_s) × 0.95', () => {
    const src = { exercise: lib['back-squat'], state: exState('back-squat', 150) };
    expect(predictE1rm(src, lib['leg-press'])).toBeCloseTo(150 * 1.8 * 0.95, 6);
  });
  it('from a non-anchor source', () => {
    const src = { exercise: lib['incline-dumbbell-press'], state: exState('incline-dumbbell-press', 40) };
    expect(predictE1rm(src, lib['bench-press'])).toBeCloseTo(40 * (1 / 0.35) * 0.95, 6);
    const dbToDb = { exercise: lib['incline-dumbbell-press'], state: exState('incline-dumbbell-press', 40) };
    expect(predictE1rm(dbToDb, lib['dumbbell-bench-press'])).toBeCloseTo(40 * (0.4 / 0.35) * 0.95, 6);
  });
  it('uses the most recently updated relative', () => {
    const p = prescribe({
      exercise: lib['bench-press'], slot: slotById('A2'), familyMembers: [
        { exercise: lib['dumbbell-bench-press'], state: exState('dumbbell-bench-press', 50, { updatedAt: 10 }) },
        { exercise: lib['incline-dumbbell-press'], state: exState('incline-dumbbell-press', 40, { updatedAt: 20 }) },
      ], bodyweight: 80, returnPhase: off, unit: 'kg',
    });
    expect(p.kind).toBe('predicted');
    expect(p.predictedFrom).toBe('incline-dumbbell-press');
    expect(p.reason).toContain('Incline dumbbell press');
    expect(p.reason).toMatch(/^Predicted set: weight predicted from your e1RM of 40 kg on Incline dumbbell press, a related movement\.$/);
  });
  it('does not predict across families (pull-up ↔ pulldown)', () => {
    const p = prescribe({
      exercise: lib['pull-up'], slot: slotById('C3'),
      familyMembers: [{ exercise: lib['lat-pulldown'], state: exState('lat-pulldown', 80) }],
      bodyweight: 80, returnPhase: off, unit: 'kg',
    });
    expect(p.kind).toBe('calibration');
  });
  it('own e1RM takes over from prediction', () => {
    const p = prescribe({
      exercise: lib['leg-press'], slot: slotById('B4'), exerciseState: exState('leg-press', 300, { sessionCount: 1 }),
      familyMembers: [{ exercise: lib['back-squat'], state: exState('back-squat', 150) }],
      bodyweight: 80, returnPhase: off, unit: 'kg',
    });
    expect(p.kind).not.toBe('predicted');
  });
  it('predicted main-lift sets use the slot’s targetReps and RIR (3 in return phase)', () => {
    const base = { exercise: lib['deadlift'], slot: slotById('C1'), familyMembers: [{ exercise: lib['romanian-deadlift'], state: exState('romanian-deadlift', 120) }], bodyweight: 80, unit: 'kg' as const };
    const a = prescribe({ ...base, returnPhase: ret(0) });
    const b = prescribe({ ...base, returnPhase: off });
    expect(a.targetRIR).toBe(3);
    expect(a.weight!).toBeLessThan(b.weight!);
  });
});

describe('swaps', () => {
  const members = [{ exercise: lib['bench-press'], state: exState('bench-press', 100) }];
  it('swap candidate uses its own state when it has one, else a prediction', () => {
    const own = prescribe({ exercise: lib['dumbbell-bench-press'], slot: slotById('A2'), exerciseState: exState('dumbbell-bench-press', 50), familyMembers: members, bodyweight: 80, returnPhase: off, unit: 'kg' });
    const pred = prescribe({ exercise: lib['dumbbell-bench-press'], slot: slotById('A2'), familyMembers: members, bodyweight: 80, returnPhase: off, unit: 'kg' });
    expect(own.kind).toBe('normal');
    expect(pred.kind).toBe('predicted');
    // The slot's style sets the targets, not the exercise: A2 is estimated-max, so repMin+1 = 7 @ RIR 2
    // → (100 × 0.4 × 0.95 = 38) / (1 + 9/30) = 29.2 → 28
    expect(pred.weight).toBe(28);
  });
  it('the same swap into a reps-first slot targets repMin @ RIR 2', () => {
    const slot = { ...slotById('A2'), progressionStyle: 'repsFirst' as const };
    const pred = prescribe({ exercise: lib['dumbbell-bench-press'], slot, familyMembers: members, bodyweight: 80, returnPhase: off, unit: 'kg' });
    // 38 / (1 + 8/30) = 30
    expect(pred.weight).toBe(30);
  });
});

describe('seeding and calibration', () => {
  it('seed e1RM = remembered e1RM (RIR 1) × detraining factor', () => {
    const base = 100 * (1 + 6 / 30);
    expect(seedE1rm(lib['bench-press'], 100, 5, 'under-1', 80)).toBeCloseTo(base, 6);
    expect(seedE1rm(lib['bench-press'], 100, 5, '1-3', 80)).toBeCloseTo(base * 0.95, 6);
    expect(seedE1rm(lib['bench-press'], 100, 5, '3-6', 80)).toBeCloseTo(base * 0.9, 6);
    expect(seedE1rm(lib['bench-press'], 100, 5, '6-plus', 80)).toBeCloseTo(base * 0.85, 6);
  });
  it('accessories start at remembered weight × factor, rounded down', () => {
    const s = seedExercise(lib['lat-pulldown'], 60, 10, '3-6', 80, 5);
    expect(s.lastWeight).toBe(52.5); // 54 → 52.5
  });
  it('3+ month gap: first set is a calibration set prefilled with the seeded weight', () => {
    const s = seedExercise(lib['back-squat'], 100, 5, '6-plus', 80, 5);
    expect(s.calibrateFirst).toBe(true);
    const p = prescribe({ exercise: lib['back-squat'], slot: slotById('A1'), exerciseState: s, familyMembers: [], bodyweight: 80, returnPhase: ret(0), unit: 'kg' });
    expect(p.kind).toBe('calibration');
    expect(p.weight).toBeGreaterThan(0);
    expect(seedExercise(lib['back-squat'], 100, 5, '1-3', 80, 5).calibrateFirst).toBe(false);
  });
  it('no seed and no related data → calibration with no weight', () => {
    const p = prescribe({ exercise: lib['back-squat'], slot: slotById('A1'), familyMembers: [], bodyweight: 80, returnPhase: ret(0), unit: 'kg' });
    expect(p).toMatchObject({ kind: 'calibration', weight: null, targetReps: 5, targetRIR: 3 });
    expect(p.reason).toMatch(/^Calibration set: enter a weight you can lift for the given number of reps/);
  });
  it('stored slot state wins', () => {
    const p = prescribe({ exercise: lib['back-squat'], slot: slotById('A1'), slotState: slotState('A1', 100, { nextWeight: 102.5, reason: 'x' }), familyMembers: [], bodyweight: 80, returnPhase: off, unit: 'kg' });
    expect(p).toMatchObject({ weight: 102.5, kind: 'normal', reason: 'x' });
  });
});

describe('seeding bodyweight accessories', () => {
  it('detraining applies to effective load, so an assisted lifter gets MORE assistance after time off', () => {
    // −20 kg assistance at 80 kg: effective 60 × 0.85 = 51 → −29 → rounds down to −30
    expect(seedExercise(lib['pull-up'], -20, 8, '6-plus', 80, 1).lastWeight).toBe(-30);
    // +10 kg added: 90 × 0.9 = 81 → +1 → rounds down to 0
    expect(seedExercise(lib['pull-up'], 10, 5, '3-6', 80, 1).lastWeight).toBe(0);
    // no time off: unchanged
    expect(seedExercise(lib['pull-up'], -20, 8, 'under-1', 80, 1).lastWeight).toBe(-20);
  });
});
