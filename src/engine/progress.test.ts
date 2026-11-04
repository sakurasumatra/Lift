import { describe, expect, it } from 'vitest';
import { advanceReturnPhase, finishSessionState, nextAccessoryPrescription, setsForMain, deloadWeight } from './index';
import { exState, finishInput, lib, set, slotState } from './testkit';


/** Three bench sets of the same kind: e1RM = weight × (1 + (reps+RIR)/30). */
const benchSets = (slotId: string, weight: number, reps: number, rpe = 9) =>
  [0, 1, 2].map((i) => set(slotId, i, weight, reps, rpe, { prescribedWeight: weight, prescriptionKind: 'normal' }));

describe('first session', () => {
  it('smoothed e1RM = session e1RM, no miss, no stronger card', () => {
    const r = finishSessionState(finishInput({ sets: benchSets('A2', 80, 7, 8) }));
    expect(r.exerciseStates['bench-press'].e1rm).toBeCloseTo(80 * (1 + 9 / 30), 6);
    expect(r.exerciseStates['bench-press'].sessionCount).toBe(1);
    expect(r.stronger).toEqual([]);
  });
});

describe('miss detection and deload', () => {
  const start = () => ({
    exerciseStates: { 'bench-press': exState('bench-press', 100) },
    slotStates: { A2: slotState('A2', 80), B1: slotState('B1', 90) },
  });

  it('a miss is judged against the PRE-update smoothed e1RM', () => {
    // 73 × 6 @ RPE 9 → 90.0 < 98 → miss, even though the smoothed value would be 96.5 after the update
    const r = finishSessionState(finishInput({ ...start(), sets: benchSets('A2', 73, 6, 9) }));
    expect(r.exerciseStates['bench-press'].missCount).toBe(1);
    expect(r.exerciseStates['bench-press'].e1rm).toBeCloseTo(100 + 0.35 * (73 * (1 + 7 / 30) - 100), 6);
    expect(r.deloaded).toEqual([]);
  });

  it('does not count a session at 98% as a miss, and resets the count', () => {
    const r = finishSessionState(finishInput({
      exerciseStates: { 'bench-press': exState('bench-press', 100, { missCount: 1 }) },
      slotStates: start().slotStates,
      sets: benchSets('A2', 80, 6, 9), // 98.67 ≥ 98
    }));
    expect(r.exerciseStates['bench-press'].missCount).toBe(0);
  });

  it('two consecutive misses → 90% of last working weight in every slot, then missCount resets', () => {
    const r = finishSessionState(finishInput({
      exerciseStates: { 'bench-press': exState('bench-press', 100, { missCount: 1 }) },
      slotStates: start().slotStates,
      sets: benchSets('A2', 73, 6, 9),
    }));
    expect(r.deloaded).toEqual(['bench-press']);
    expect(r.exerciseStates['bench-press'].missCount).toBe(0);
    // trained slot: 90% of 73 = 65.7 → 65
    expect(r.slotStates.A2).toMatchObject({ nextWeight: 65, prescriptionKind: 'deload' });
    expect(r.slotStates.A2.reason).toMatch(/^Deload/);
    // other bench slot: 90% of its last prescribed weight (90) = 81 → 80
    expect(r.slotStates.B1).toMatchObject({ nextWeight: 80, prescriptionKind: 'deload' });
  });

  it('deload is exempt from the clamp; the next normal prescription is clamped from it', () => {
    const afterDeload = finishSessionState(finishInput({
      exerciseStates: { 'bench-press': exState('bench-press', 100, { missCount: 1 }) },
      slotStates: start().slotStates,
      sets: benchSets('A2', 73, 6, 9),
    }));
    expect(afterDeload.slotStates.A2.nextWeight).toBeLessThan(80 - 2.5); // far below ±1 increment
    // Recovery session: strong sets; e1RM is high but weight may only rise one increment from the deload weight
    const r = finishSessionState(finishInput({
      exerciseStates: afterDeload.exerciseStates,
      slotStates: afterDeload.slotStates,
      sets: benchSets('A2', 65, 8, 8).map((s) => ({ ...s, prescriptionKind: 'deload' as const })),
    }));
    expect(r.slotStates.A2.prescriptionKind).toBe('normal');
    expect(r.slotStates.A2.nextWeight).toBeLessThanOrEqual(65 + 2.5);
  });

  it('a non-miss between misses breaks the streak', () => {
    const r = finishSessionState(finishInput({
      exerciseStates: { 'bench-press': exState('bench-press', 100, { missCount: 1 }) },
      slotStates: start().slotStates,
      sets: benchSets('A2', 85, 6, 9),
    }));
    expect(r.deloaded).toEqual([]);
    expect(r.exerciseStates['bench-press'].missCount).toBe(0);
  });

  it('deload weight maths: bodyweight uses effective load', () => {
    // +10 added at 80 kg: effective 90 × 0.9 = 81 → +1 added → rounds down to 0
    expect(deloadWeight(10, lib['pull-up'], 80)).toBe(0);
    // barbell: plain 90%
    expect(deloadWeight(100, lib['bench-press'], 80)).toBe(90);
  });
});

describe('bench press: two slots, one e1RM', () => {
  it('produces different weights per slot and the per-slot clamp never fights', () => {
    // e1RM 120: 6–8 slot → 7 reps @ RIR 2 = 92.3 → 90; 4–6 slot → 5 reps @ RIR 2 = 97.3 → 95
    const r = finishSessionState(finishInput({
      exerciseStates: { 'bench-press': exState('bench-press', 120) },
      slotStates: { A2: slotState('A2', 90), B1: slotState('B1', 95) },
      sets: [0, 1, 2].map((i) => set('A2', i, 90, 8, 8, { prescribedWeight: 90, prescriptionKind: 'normal' })), // e1RM 120
    }));
    expect(r.slotStates.A2.nextWeight).toBe(90);
    expect(r.slotStates.B1.nextWeight).toBe(95);
    // B1's lastPrescribed is untouched: it was not trained
    expect(r.slotStates.B1.lastPrescribedWeight).toBe(95);
  });
  it('an untrained slot follows the shared e1RM, within its own clamp', () => {
    const r = finishSessionState(finishInput({
      exerciseStates: { 'bench-press': exState('bench-press', 120) },
      slotStates: { A2: slotState('A2', 90), B1: slotState('B1', 95) },
      sets: [0, 1, 2].map((i) => set('A2', i, 100, 8, 8, { prescribedWeight: 90, prescriptionKind: 'normal' })), // e1RM 133
    }));
    const e1 = 120 + 0.35 * (100 * (1 + 10 / 30) - 120); // 124.67
    expect(r.exerciseStates['bench-press'].e1rm).toBeCloseTo(e1, 6);
    expect(r.slotStates.B1.nextWeight).toBe(97.5); // 124.67 / 1.2333 = 101.1, clamped to 95 + 2.5
    expect(r.slotStates.A2.nextWeight).toBe(92.5); // 124.67 / 1.3 = 95.9, clamped to 90 + 2.5
  });
});

describe('accessories: double progression', () => {
  const base = { repMin: 8, repMax: 12, increment: 2.5, unit: 'kg' as const };
  it('all sets at repMax → +1 increment', () => {
    const r = nextAccessoryPrescription({ ...base, failCountBefore: 0, sets: [12, 12, 12].map((reps) => ({ weight: 50, reps })) });
    expect(r).toMatchObject({ weight: 52.5, failCount: 0 });
  });
  it('one set below repMin: same weight, remembered; second time in a row → −1 increment', () => {
    const sets = [10, 9, 7].map((reps) => ({ weight: 50, reps }));
    const first = nextAccessoryPrescription({ ...base, failCountBefore: 0, sets });
    expect(first).toMatchObject({ weight: 50, failCount: 1 });
    const second = nextAccessoryPrescription({ ...base, failCountBefore: first.failCount, sets });
    expect(second).toMatchObject({ weight: 47.5, failCount: 0 });
  });
  it('a good session in between resets the fail count', () => {
    const ok = nextAccessoryPrescription({ ...base, failCountBefore: 1, sets: [10, 9, 9].map((reps) => ({ weight: 50, reps })) });
    expect(ok).toMatchObject({ weight: 50, failCount: 0 });
  });
  it('through finishSession: accessory fail count is stored on the exercise state', () => {
    const sets = [10, 9, 7].map((reps, i) => set('A3', i, 50, reps, null, { prescribedWeight: 50 }));
    const r = finishSessionState(finishInput({ sets, exerciseStates: { 'chest-supported-row': exState('chest-supported-row', 80) } }));
    expect(r.exerciseStates['chest-supported-row'].accessoryFailCount).toBe(1);
    expect(r.slotStates.A3.nextWeight).toBe(50);
    const r2 = finishSessionState(finishInput({ sets, exerciseStates: r.exerciseStates, slotStates: r.slotStates }));
    expect(r2.slotStates.A3.nextWeight).toBe(47.5);
  });
  it('accessories never deload', () => {
    const lowSets = [0, 1, 2].map((i) => set('A3', i, 30, 8, null, { prescribedWeight: 30 }));
    let states = { 'chest-supported-row': exState('chest-supported-row', 200) };
    for (let i = 0; i < 3; i++) {
      const r = finishSessionState(finishInput({ sets: lowSets, exerciseStates: states }));
      expect(r.deloaded).toEqual([]);
      states = r.exerciseStates as typeof states;
    }
  });
});

describe('getting stronger cards in the summary', () => {
  it('only for non-first sessions with a gain of ≥ 1 increment', () => {
    const strong = [0, 1, 2].map((i) => set('A2', i, 100, 6, 8, { prescribedWeight: 90 })); // e1RM 126.7
    const r = finishSessionState(finishInput({ sets: strong, exerciseStates: { 'bench-press': exState('bench-press', 110) } }));
    expect(r.stronger).toHaveLength(1);
    expect(r.stronger[0]).toMatchObject({ exerciseId: 'bench-press', oldE1rm: 110 });
    expect(r.stronger[0].delta).toBeCloseTo(0.35 * (100 * (1 + 8 / 30) - 110), 6);
    const first = finishSessionState(finishInput({ sets: strong }));
    expect(first.stronger).toEqual([]);
  });
});

describe('return phase', () => {
  it('sessions 1–6: one set fewer on main lifts; 7–12 full; ends after 12', () => {
    let rp = { active: true, sessionsCompleted: 0 };
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(setsForMain(4, rp));
      rp = advanceReturnPhase(rp);
    }
    expect(seen).toEqual([3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4]);
    expect(rp).toEqual({ active: false, sessionsCompleted: 12 });
    expect(setsForMain(4, rp)).toBe(4);
    expect(advanceReturnPhase(rp)).toEqual(rp);
  });
  it('finishing a session advances the phase; an empty session does not', () => {
    const r = finishSessionState(finishInput({ returnPhase: { active: true, sessionsCompleted: 11 }, sets: benchSets('A2', 80, 7, 8) }));
    expect(r.returnPhase).toEqual({ active: false, sessionsCompleted: 12 });
    expect(finishSessionState(finishInput({ returnPhase: { active: true, sessionsCompleted: 3 }, sets: [] })).returnPhase.sessionsCompleted).toBe(3);
  });
  it('fast upward smoothing (α 0.6)', () => {
    const sets = benchSets('A2', 80, 8, 8); // 80 × 1.3333 = 106.67
    const slow = finishSessionState(finishInput({ sets, exerciseStates: { 'bench-press': exState('bench-press', 100) } }));
    const fast = finishSessionState(finishInput({ sets, returnPhase: { active: true, sessionsCompleted: 2 }, exerciseStates: { 'bench-press': exState('bench-press', 100) } }));
    expect(slow.exerciseStates['bench-press'].e1rm).toBeCloseTo(100 + 0.35 * 6.6667, 3);
    expect(fast.exerciseStates['bench-press'].e1rm).toBeCloseTo(100 + 0.6 * 6.6667, 3);
  });
  it('misses and deloads are disabled', () => {
    let exerciseStates = { 'bench-press': exState('bench-press', 100) };
    let rp = { active: true, sessionsCompleted: 0 };
    for (let i = 0; i < 3; i++) {
      const r = finishSessionState(finishInput({ returnPhase: rp, exerciseStates, sets: benchSets('A2', 73, 6, 9) }));
      expect(r.deloaded).toEqual([]);
      expect(r.exerciseStates['bench-press'].missCount).toBe(0);
      exerciseStates = r.exerciseStates as typeof exerciseStates;
      rp = r.returnPhase;
    }
  });
  it('next prescription uses RIR 3 while the upcoming session is 1–6, RIR 2 from session 7', () => {
    const run = (done: number) => finishSessionState(finishInput({
      returnPhase: { active: true, sessionsCompleted: done },
      exerciseStates: { 'bench-press': exState('bench-press', 120) },
      slotStates: { A2: slotState('A2', 70) },
      sets: benchSets('A2', 70, 8, 8),
    })).slotStates.A2;
    expect(run(2).reason).toContain('3 in reserve');
    expect(run(6).reason).toContain('2 in reserve'); // finishing session 7 → next is 8
    expect(run(4).reason).toContain('3 in reserve'); // finishing session 5 → next is 6
    expect(run(5).reason).toContain('2 in reserve'); // finishing session 6 → next is 7
  });
});

describe('swaps', () => {
  it('logs go to the swapped-in exercise’s own history; the slot is left alone', () => {
    const sets = [0, 1, 2].map((i) => ({
      ...set('A2', i, 32, 8, 8, { prescribedWeight: 30 }),
      exerciseId: 'dumbbell-bench-press',
    }));
    const r = finishSessionState(finishInput({
      sets,
      exerciseStates: { 'bench-press': exState('bench-press', 120) },
      slotStates: { A2: slotState('A2', 90) },
    }));
    expect(r.exerciseStates['dumbbell-bench-press']).toBeDefined();
    expect(r.exerciseStates['bench-press']).toBeUndefined();
    expect(r.slotStates.A2).toBeUndefined();
    expect(r.summary[0]).toMatchObject({ slotId: 'A2', exerciseId: 'dumbbell-bench-press' });
  });
});

describe('bodyweight exercises', () => {
  it('e1RM uses effective load; next prescription is added load', () => {
    // 80 kg bodyweight, −10 kg assistance, 8 reps @ RPE 8 → eff 70 → e1RM 70 × (1+10/30) = 93.33
    const sets = [0, 1, 2].map((i) => set('C3', i, -10, 8, 8, { prescribedWeight: -10 }));
    const r = finishSessionState(finishInput({ sets }));
    expect(r.exerciseStates['pull-up'].e1rm).toBeCloseTo(93.333, 2);
  });
});

describe('review fixes', () => {
  it('a pending deload on an untrained slot is kept until that slot is trained', () => {
    // Bench deloaded in both slots; now A2 is trained at its deload weight. B1 has not been trained yet.
    const r = finishSessionState(finishInput({
      exerciseStates: { 'bench-press': exState('bench-press', 100) },
      slotStates: {
        A2: slotState('A2', 72.5, { nextWeight: 65, prescriptionKind: 'deload' }),
        B1: slotState('B1', 90, { nextWeight: 80, prescriptionKind: 'deload', reason: 'Deload: …' }),
      },
      sets: [0, 1, 2].map((i) => set('A2', i, 65, 8, 8, { prescribedWeight: 65, prescriptionKind: 'deload' })),
    }));
    expect(r.slotStates.B1).toBeUndefined(); // untouched: the stored deload still applies next time
    expect(r.slotStates.A2.prescriptionKind).toBe('normal');
  });

  it('deload uses the slot’s last WORKING weight, not its prescribed weight', () => {
    // A2 prescribed 80 but the lifter worked up to 85.
    const sets = [80, 82.5, 85].map((w, i) => set('A2', i, w, 5, 9, { prescribedWeight: i === 0 ? 80 : w, prescriptionKind: 'normal' }));
    const r = finishSessionState(finishInput({
      exerciseStates: { 'bench-press': exState('bench-press', 130, { missCount: 1 }) },
      // B1 last trained: prescribed 90, but the last set was done at 95
      slotStates: { A2: slotState('A2', 80), B1: slotState('B1', 90, { lastWorkingWeight: 95 }) },
      sets,
    }));
    expect(r.deloaded).toEqual(['bench-press']);
    expect(r.slotStates.A2.nextWeight).toBe(75); // 90% of 85 = 76.5 → 75 (90% of prescribed 80 would be 72.5)
    expect(r.slotStates.B1.nextWeight).toBe(85); // 90% of 95 = 85.5 → 85 (90% of prescribed 90 would be 80)
    expect(r.slotStates.A2.lastWorkingWeight).toBe(85);
  });

  it('a calibration placeholder is never used as the "last working weight" of an untrained slot', () => {
    // Legacy B1 state from a calibration session that stored the empty bar (20) as its prescription.
    const r = finishSessionState(finishInput({
      exerciseStates: { 'bench-press': exState('bench-press', 100, { missCount: 1 }) },
      slotStates: { A2: slotState('A2', 80), B1: slotState('B1', 20, { lastPrescribedKind: 'calibration', nextWeight: 85 }) },
      sets: benchSets('A2', 73, 6, 9),
    }));
    expect(r.slotStates.B1.nextWeight).toBe(75); // 90% of 85, not 90% of the 20 kg placeholder
  });

  it('an accessory logged with only zero-rep sets does not crash and counts as a failed session', () => {
    const sets = [0, 1].map((i) => set('A3', i, 50, 0, null, { prescribedWeight: 50 }));
    const first = finishSessionState(finishInput({ sets }));
    expect(first.slotStates.A3.nextWeight).toBe(50);
    const withState = finishSessionState(finishInput({ sets, exerciseStates: { 'chest-supported-row': exState('chest-supported-row', 80, { accessoryFailCount: 1 }) } }));
    expect(withState.slotStates.A3.nextWeight).toBe(47.5);
    expect(withState.exerciseStates['chest-supported-row']).toMatchObject({ e1rm: 80, accessoryFailCount: 0 });
  });

  it('the session that ends the return phase still smooths upward with α 0.6', () => {
    const sets = benchSets('A2', 80, 8, 8); // 106.67
    const r = finishSessionState(finishInput({ sets, returnPhase: { active: true, sessionsCompleted: 11 }, exerciseStates: { 'bench-press': exState('bench-press', 100) } }));
    expect(r.returnPhase.active).toBe(false);
    expect(r.exerciseStates['bench-press'].e1rm).toBeCloseTo(100 + 0.6 * 6.6667, 3);
  });
});
