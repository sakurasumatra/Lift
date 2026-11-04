import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LiftDB, ensureSeeded } from './db';
import { applyOnboarding, finishSession, loadSnapshot, makeSwapPermanent, nextDayId, saveSet, startSession } from './service';

let db: LiftDB;
beforeEach(async () => {
  db = new LiftDB(`test-${Math.random()}`);
  await ensureSeeded(db);
});

describe('seeding', () => {
  it('seeds library, program and settings with the return phase on', async () => {
    const snap = await loadSnapshot(db);
    expect(Object.keys(snap.exercises).length).toBeGreaterThanOrEqual(150);
    expect(snap.days.map((d) => d.id)).toEqual(['A', 'B', 'C']);
    expect(snap.settings.returnPhase).toEqual({ active: true, sessionsCompleted: 0 });
    expect(snap.settings.units).toBe('kg');
  });
  it('is idempotent', async () => {
    await ensureSeeded(db);
    expect(await db.exercises.count()).toBeGreaterThanOrEqual(150);
  });
});

describe('sessions', () => {
  it('rotates A → B → C → A regardless of weekday; early-ended sessions count', async () => {
    expect(await nextDayId(db)).toBe('A');
    for (const expected of ['A', 'B', 'C', 'A']) {
      const s = await startSession(db);
      expect(s.dayId).toBe(expected);
      await finishSession(db, s.id, expected === 'B');
    }
    expect(await nextDayId(db)).toBe('B');
  });

  it('finishing persists exercise/slot state, summary and the return-phase counter', async () => {
    const s = await startSession(db, 'A');
    for (let i = 0; i < 3; i++) {
      await saveSet(db, { sessionId: s.id, slotId: 'A1', exerciseId: 'back-squat', setIndex: i, weight: 80, reps: 6, rpe: 8, prescribedWeight: null, prescriptionKind: 'calibration' });
    }
    const done = await finishSession(db, s.id, false);
    const snap = await loadSnapshot(db);
    expect(snap.exerciseStates['back-squat'].sessionCount).toBe(1);
    expect(snap.slotStates.A1.nextWeight).toBeGreaterThan(0);
    expect(done.summary!.items[0].exerciseId).toBe('back-squat');
    expect(snap.settings.returnPhase.sessionsCompleted).toBe(1);
  });

  it('editing a set overwrites rather than duplicates', async () => {
    const s = await startSession(db, 'A');
    const base = { sessionId: s.id, slotId: 'A1', exerciseId: 'back-squat', setIndex: 0, weight: 80, reps: 6, rpe: 8, prescribedWeight: 80, prescriptionKind: 'normal' as const };
    await saveSet(db, base);
    await saveSet(db, { ...base, reps: 8 });
    const rows = await db.sets.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].reps).toBe(8);
  });
});

describe('onboarding', () => {
  it('seeds e1RM with detraining factor, accessory start weights and a calibration flag for 3+ month gaps', async () => {
    const n = await applyOnboarding(db, {
      bodyweight: 80,
      returningAfterBreak: true,
      entries: [
        { exerciseId: 'back-squat', weight: 100, reps: 5, ago: '6-plus' },
        { exerciseId: 'lat-pulldown', weight: 60, reps: 10, ago: '1-3' },
        { exerciseId: 'bench-press', weight: 0, reps: 0, ago: '1-3' }, // ignored: no reps
      ],
    });
    expect(n).toBe(2);
    const snap = await loadSnapshot(db);
    expect(snap.exerciseStates['back-squat'].e1rm).toBeCloseTo(100 * (1 + 6 / 30) * 0.85, 6);
    expect(snap.exerciseStates['back-squat'].calibrateFirst).toBe(true);
    expect(snap.exerciseStates['lat-pulldown'].lastWeight).toBe(55); // 60 × 0.95 = 57 → rounded down to 55
    expect(snap.exerciseStates['bench-press']).toBeUndefined();
    expect(snap.settings.bodyweight).toBe(80);
    expect(snap.settings.onboarded).toBe(true);
    expect(snap.settings.returnPhase.active).toBe(true);
  });
  it('does not overwrite an exercise that already has logged sessions', async () => {
    await db.exerciseState.put({ exerciseId: 'back-squat', e1rm: 150, missCount: 0, accessoryFailCount: 0, updatedAt: 1, sessionCount: 2 });
    await applyOnboarding(db, { bodyweight: null, returningAfterBreak: false, entries: [{ exerciseId: 'back-squat', weight: 50, reps: 5, ago: '1-3' }] });
    expect((await loadSnapshot(db)).exerciseStates['back-squat'].e1rm).toBe(150);
    expect((await loadSnapshot(db)).settings.returnPhase.active).toBe(false);
  });
});

describe('review fixes', () => {
  it('onboarding skips bodyweight lifts when no bodyweight is known (instead of seeding e1RM from 0 kg)', async () => {
    const n = await applyOnboarding(db, { bodyweight: null, returningAfterBreak: true, entries: [{ exerciseId: 'pull-up', weight: 0, reps: 8, ago: '1-3' }] });
    expect(n).toBe(0);
    expect((await loadSnapshot(db)).exerciseStates['pull-up']).toBeUndefined();
    await applyOnboarding(db, { bodyweight: 80, returningAfterBreak: true, entries: [{ exerciseId: 'pull-up', weight: 0, reps: 8, ago: '1-3' }] });
    expect((await loadSnapshot(db)).exerciseStates['pull-up'].e1rm).toBeCloseTo(80 * 1.3 * 0.95, 6);
  });

  it('"Make permanent" swap drops the old exercise’s slot state so its weight is not reused', async () => {
    await db.slotState.put({ slotId: 'A2', lastPrescribedWeight: 90, nextWeight: 92.5, reason: 'bench', prescriptionKind: 'normal' });
    const s = await startSession(db, 'A');
    await db.sessions.update(s.id, { swaps: [{ slotId: 'A2', fromExerciseId: 'bench-press', toExerciseId: 'dumbbell-bench-press' }] });
    await makeSwapPermanent(db, s.id, 'A2', 'dumbbell-bench-press');
    const snap = await loadSnapshot(db);
    expect(snap.days[0].slots.find((x) => x.slotId === 'A2')!.exerciseId).toBe('dumbbell-bench-press');
    expect(snap.slotStates.A2).toBeUndefined();
    expect((await db.sessions.get(s.id))!.swaps).toEqual([]);
  });
});
