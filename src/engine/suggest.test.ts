import { describe, expect, it } from 'vitest';
import { checkGettingStronger, suggestNextWeight } from './index';
import { exState, lib } from './testkit';

const base = { exercise: lib['bench-press'], repMin: 6, repMax: 8, targetReps: 7, targetRIR: 2, bodyweight: 80, unit: 'kg' as const, kind: 'normal' as const };

describe('in-session suggestions', () => {
  it('+1 increment when reps ≥ repMax and RIR ≥ 2', () => {
    const s = suggestNextWeight({ ...base, set: { weight: 80, reps: 8, rpe: 8 } });
    expect(s).toMatchObject({ weight: 82.5, change: 'up' });
    expect(s.message).toContain('+2.5 kg');
  });
  it('keeps weight at repMax with RIR < 2', () => {
    expect(suggestNextWeight({ ...base, set: { weight: 80, reps: 8, rpe: 9 } }).change).toBe('same');
  });
  it('−1 increment when reps < repMin', () => {
    expect(suggestNextWeight({ ...base, set: { weight: 80, reps: 5, rpe: 8 } })).toMatchObject({ weight: 77.5, change: 'down' });
  });
  it('−1 increment when RIR 0 and reps < target', () => {
    expect(suggestNextWeight({ ...base, set: { weight: 80, reps: 6, rpe: 10 } })).toMatchObject({ weight: 77.5, change: 'down' });
  });
  it('reps exactly at repMin is not "below repMin"', () => {
    expect(suggestNextWeight({ ...base, set: { weight: 80, reps: 6, rpe: 8 } })).toMatchObject({ weight: 80, change: 'same' });
    const acc = { ...base, exercise: lib['lat-pulldown'], repMin: 8, repMax: 12, targetReps: 8 };
    expect(suggestNextWeight({ ...acc, set: { weight: 50, reps: 8 } }).change).toBe('same');
  });
  it('keeps weight otherwise (RIR 0 at target is fine)', () => {
    expect(suggestNextWeight({ ...base, set: { weight: 80, reps: 7, rpe: 10 } })).toMatchObject({ weight: 80, change: 'same', message: null });
  });
  it('without RPE only rep conditions apply', () => {
    const acc = { ...base, exercise: lib['lat-pulldown'], repMin: 8, repMax: 12, targetReps: 8 };
    expect(suggestNextWeight({ ...acc, set: { weight: 50, reps: 12 } }).change).toBe('up');
    expect(suggestNextWeight({ ...acc, set: { weight: 50, reps: 7 } }).change).toBe('down');
    expect(suggestNextWeight({ ...acc, set: { weight: 50, reps: 9 } }).change).toBe('same');
  });
  it('uses the exercise increment (dumbbell 2 kg)', () => {
    const db = { ...base, exercise: lib['dumbbell-curl'], repMin: 10, repMax: 15, targetReps: 10 };
    expect(suggestNextWeight({ ...db, set: { weight: 14, reps: 15 } }).weight).toBe(16);
  });
  it('calibration set: next weight comes from that set’s e1RM at the current target', () => {
    // 60 kg × 8 @ RPE 8 → e1RM 60 × (1 + 10/30) = 80 → at 7 reps, RIR 2: 80 / 1.3 = 61.5 → 60
    const s = suggestNextWeight({ ...base, kind: 'calibration', set: { weight: 60, reps: 8, rpe: 8 } });
    expect(s).toMatchObject({ weight: 60, change: 'recalibrated' });
    const heavy = suggestNextWeight({ ...base, kind: 'calibration', set: { weight: 60, reps: 12, rpe: 7 } });
    expect(heavy.weight).toBe(floor25((60 * (1 + 15 / 30)) / 1.3));
  });
  it('calibration respects targetRIR 3 in the return phase', () => {
    const a = suggestNextWeight({ ...base, kind: 'calibration', targetRIR: 3, set: { weight: 100, reps: 10, rpe: 8 } });
    const b = suggestNextWeight({ ...base, kind: 'calibration', targetRIR: 2, set: { weight: 100, reps: 10, rpe: 8 } });
    expect(a.weight).toBeLessThan(b.weight);
  });
});
const floor25 = (x: number) => Math.floor(x / 2.5 + 1e-9) * 2.5;

describe('"you’re getting stronger"', () => {
  const bench = lib['bench-press'];
  const strong = [{ weight: 100, reps: 5, rpe: 8 }]; // e1RM 100 × 1.2333 = 123.3
  it('fires when provisional beats stored by ≥ 1 increment', () => {
    const r = checkGettingStronger({ exercise: bench, state: exState('bench-press', 110), setsSoFar: strong, bodyweight: 80, returnActive: false });
    expect(r).not.toBeNull();
    expect(r!.provisional).toBeCloseTo(110 + 0.35 * (123.333 - 110), 2);
  });
  it('does not fire for gains below one increment', () => {
    expect(checkGettingStronger({ exercise: bench, state: exState('bench-press', 122), setsSoFar: strong, bodyweight: 80, returnActive: false })).toBeNull();
  });
  it('never on a first-ever session (no state, or seeded with no logged sessions)', () => {
    expect(checkGettingStronger({ exercise: bench, state: undefined, setsSoFar: strong, bodyweight: 80, returnActive: false })).toBeNull();
    expect(checkGettingStronger({ exercise: bench, state: exState('bench-press', 50, { sessionCount: 0 }), setsSoFar: strong, bodyweight: 80, returnActive: false })).toBeNull();
  });
  it('at most once per exercise per session', () => {
    expect(checkGettingStronger({ exercise: bench, state: exState('bench-press', 110), setsSoFar: strong, bodyweight: 80, returnActive: false, alreadyShown: true })).toBeNull();
  });
  it('uses fast α in the return phase', () => {
    const slow = checkGettingStronger({ exercise: bench, state: exState('bench-press', 120), setsSoFar: strong, bodyweight: 80, returnActive: false });
    const fast = checkGettingStronger({ exercise: bench, state: exState('bench-press', 120), setsSoFar: strong, bodyweight: 80, returnActive: true });
    expect(slow).toBeNull(); // +1.17 < 2.5
    expect(fast).toBeNull(); // +2.0 < 2.5
    const fast2 = checkGettingStronger({ exercise: bench, state: exState('bench-press', 118), setsSoFar: strong, bodyweight: 80, returnActive: true });
    expect(fast2).not.toBeNull(); // +3.2
  });
});

describe('"you’re getting stronger" toast survives a screen remount', () => {
  const bench = lib['bench-press'];
  const base = { exercise: bench, state: exState('bench-press', 110), bodyweight: 80, returnActive: false };
  it('fires on the set that first crosses the threshold', () => {
    const before = [{ weight: 80, reps: 5, rpe: 8 }]; // 98.7: below
    expect(checkGettingStronger({ ...base, setsBefore: before, setsSoFar: [...before, { weight: 100, reps: 5, rpe: 8 }] })).not.toBeNull();
  });
  it('does not fire again for later sets once an earlier set already crossed it (no in-memory flag)', () => {
    const before = [{ weight: 100, reps: 5, rpe: 8 }]; // already crossed
    expect(checkGettingStronger({ ...base, setsBefore: before, setsSoFar: [...before, { weight: 102.5, reps: 5, rpe: 8 }] })).toBeNull();
  });
});
