import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LiftDB, ensureSeeded } from './db';
import { finishSession, loadSnapshot, nextDayId, saveSet, startSession } from './service';

let db: LiftDB;
beforeEach(async () => {
  db = new LiftDB(`test-${Math.random()}`);
  await ensureSeeded(db);
});

describe('seeding', () => {
  it('seeds library, program and settings with the return phase on', async () => {
    const snap = await loadSnapshot(db);
    expect(Object.keys(snap.exercises).length).toBe(32);
    expect(snap.days.map((d) => d.id)).toEqual(['A', 'B', 'C']);
    expect(snap.settings.returnPhase).toEqual({ active: true, sessionsCompleted: 0 });
    expect(snap.settings.units).toBe('kg');
  });
  it('is idempotent', async () => {
    await ensureSeeded(db);
    expect(await db.exercises.count()).toBe(32);
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
