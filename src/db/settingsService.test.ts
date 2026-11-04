import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LiftDB, ensureSeeded } from './db';
import { exportData, importData, validateBackup } from './backup';
import { applyOnboarding, finishSession, loadSnapshot, saveSet, startSession } from './service';
import { resetAllData, saveProgramDay, setFamilyRatio, setIncrement, switchUnits, updateExercise } from './settingsService';

let db: LiftDB;
beforeEach(async () => {
  db = new LiftDB(`test-${Math.random()}`);
  await ensureSeeded(db);
});

async function doSession() {
  const s = await startSession(db, 'A');
  for (let i = 0; i < 3; i++) await saveSet(db, { sessionId: s.id, slotId: 'A1', exerciseId: 'back-squat', setIndex: i, weight: 100, reps: 5, rpe: 8, prescribedWeight: 100, prescriptionKind: 'normal' });
  await finishSession(db, s.id, false);
}

describe('unit switching', () => {
  it('converts weights, e1RMs, bodyweight, increments and re-rounds prescriptions', async () => {
    await applyOnboarding(db, { bodyweight: 80, returningAfterBreak: false, entries: [] });
    await doSession();
    const before = await loadSnapshot(db);
    await switchUnits(db, 'lb');
    const after = await loadSnapshot(db);
    expect(after.settings.units).toBe('lb');
    expect(after.settings.bodyweight).toBeCloseTo(176.4, 1);
    expect(after.settings.increments.barbell).toBe(5);
    expect(after.exercises['back-squat'].increment).toBe(5);
    expect(after.exerciseStates['back-squat'].e1rm).toBeCloseTo(before.exerciseStates['back-squat'].e1rm * 2.20462, 1);
    const next = after.slotStates.A1.nextWeight;
    expect(next % 5).toBe(0);
    expect(next).toBeLessThanOrEqual(before.slotStates.A1.nextWeight * 2.20462);
    expect((await db.sets.toArray())[0].weight).toBeCloseTo(220.5, 1);
    // and back again
    await switchUnits(db, 'kg');
    expect((await loadSnapshot(db)).exercises['back-squat'].increment).toBe(2.5);
  });
  it('is a no-op when the unit is unchanged', async () => {
    await switchUnits(db, 'kg');
    expect((await loadSnapshot(db)).settings.units).toBe('kg');
  });
});

describe('settings edits', () => {
  it('changing an equipment increment updates every exercise that uses it', async () => {
    await setIncrement(db, 'barbell', 1.25);
    const snap = await loadSnapshot(db);
    expect(snap.settings.increments.barbell).toBe(1.25);
    expect(snap.exercises['bench-press'].increment).toBe(1.25);
    expect(snap.exercises['dumbbell-curl'].increment).toBe(2);
  });
  it('family ratio and exercise type/equipment edits', async () => {
    await setFamilyRatio(db, 'leg-press', 2);
    await updateExercise(db, 'lat-pulldown', { equipment: 'machine', type: 'main' });
    const snap = await loadSnapshot(db);
    expect(snap.exercises['leg-press'].familyRatio).toBe(2);
    expect(snap.exercises['lat-pulldown']).toMatchObject({ equipment: 'machine', type: 'main', increment: 2.5 });
  });
  it('saving a program day clears slot state for removed or re-assigned slots only', async () => {
    await doSession();
    await db.slotState.put({ slotId: 'A2', nextWeight: 50, reason: 'x', prescriptionKind: 'normal' });
    const day = (await db.programDays.get('A'))!;
    // A1 keeps its exercise (state kept); A2 gets a new exercise (state dropped)
    await saveProgramDay(db, 'A', day.slots.map((s) => (s.slotId === 'A2' ? { ...s, exerciseId: 'dumbbell-bench-press' } : s)));
    const keys = (await db.slotState.toArray()).map((s) => s.slotId);
    expect(keys).toContain('A1');
    expect(keys).not.toContain('A2');
    await saveProgramDay(db, 'A', day.slots.filter((s) => s.slotId !== 'A1'));
    expect((await db.slotState.toArray()).map((s) => s.slotId)).not.toContain('A1');
  });
  it('reset wipes data and re-seeds, returning to onboarding', async () => {
    await applyOnboarding(db, { bodyweight: 80, returningAfterBreak: true, entries: [] });
    await doSession();
    await resetAllData(db);
    const snap = await loadSnapshot(db);
    expect(snap.settings.onboarded).toBeUndefined();
    expect(await db.sessions.count()).toBe(0);
    expect(Object.keys(snap.exercises)).toHaveLength(32);
    expect(snap.settings.returnPhase).toEqual({ active: true, sessionsCompleted: 0 });
  });
});

describe('export / import', () => {
  it('round-trips everything', async () => {
    await applyOnboarding(db, { bodyweight: 80, returningAfterBreak: true, entries: [{ exerciseId: 'bench-press', weight: 60, reps: 5, ago: '1-3' }] });
    await doSession();
    const json = JSON.parse(JSON.stringify(await exportData(db)));
    const other = new LiftDB(`test-${Math.random()}`);
    await ensureSeeded(other);
    await importData(other, json);
    expect(await exportData(other).then((f) => ({ ...f, exportedAt: '' }))).toEqual({ ...json, exportedAt: '' });
  });
  it('rejects bad files without touching existing data', async () => {
    await doSession();
    const good = JSON.parse(JSON.stringify(await exportData(db)));
    const bad = [null, 'x', {}, { ...good, app: 'other' }, { ...good, version: 99 }, { ...good, tables: { ...good.tables, sets: 'no' } }, { ...good, tables: { ...good.tables, settings: [] } }, { ...good, tables: { ...good.tables, exercises: [] } }];
    for (const b of bad) {
      expect(() => validateBackup(b)).toThrow();
      await expect(importData(db, b)).rejects.toThrow();
    }
    expect(await db.sessions.count()).toBe(1);
  });
});

describe('unit switching: review fixes', () => {
  it('converts stored session summaries and last working weights too', async () => {
    await db.exerciseState.put({ exerciseId: 'back-squat', e1rm: 110, missCount: 0, accessoryFailCount: 0, updatedAt: 1, sessionCount: 3 });
    await db.slotState.put({ slotId: 'A1', lastPrescribedWeight: 90, nextWeight: 92.5, reason: 'x', prescriptionKind: 'normal' });
    await doSession(); // 100 × 5 @ 8 → e1RM 123.3 → stronger card
    const before = (await db.sessions.toArray())[0].summary!;
    expect(before.stronger).toHaveLength(1);
    await switchUnits(db, 'lb');
    const after = (await db.sessions.toArray())[0].summary!;
    expect(after.stronger[0].newE1rm).toBeCloseTo(before.stronger[0].newE1rm * 2.20462, 1);
    expect(after.stronger[0].delta).toBeCloseTo(before.stronger[0].delta * 2.20462, 1);
    expect(after.items[0].nextWeight! % 5).toBe(0);
    expect(after.items[0].nextWeight!).toBeCloseTo(before.items[0].nextWeight! * 2.20462, -1);
    expect((await db.slotState.get('A1'))!.lastWorkingWeight).toBeCloseTo(220.5, 1);
  });
});
