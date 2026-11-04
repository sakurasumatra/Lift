import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LiftDB, ensureSeeded } from './db';
import { createCustomExercise, deleteCustomExercise, setExerciseHidden, updateCustomExercise } from './libraryService';
import { loadSnapshot, saveSet, startSession } from './service';
import { setIncrement, switchUnits } from './settingsService';
import { slotPrescription } from '../ui/prescriptions';

let db: LiftDB;
beforeEach(async () => {
  db = new LiftDB(`test-${Math.random()}`);
  await ensureSeeded(db);
});

const base = { name: 'Landmine press', equipment: 'barbell' as const, primaryMuscle: 'shoulders' as const, defaultProgressionStyle: 'repsFirst' as const };

describe('custom exercises', () => {
  it('creates an exercise that behaves like a built-in one (increment from settings, in the snapshot)', async () => {
    await setIncrement(db, 'barbell', 1.25);
    const r = await createCustomExercise(db, base);
    expect('id' in r).toBe(true);
    const ex = (await loadSnapshot(db)).exercises[(r as { id: string }).id];
    expect(ex).toMatchObject({ name: 'Landmine press', equipment: 'barbell', increment: 1.25, isCustom: true, hidden: false, primaryMuscle: 'shoulders' });
    expect(ex.family).toBeUndefined();
  });

  it('validates the name, the ratio, and duplicate names (case-insensitive, including built-ins)', async () => {
    expect(await createCustomExercise(db, { ...base, name: '   ' })).toHaveProperty('error');
    expect(await createCustomExercise(db, { ...base, name: 'bench PRESS' })).toHaveProperty('error');
    expect(await createCustomExercise(db, { ...base, family: 'vertical-press' })).toHaveProperty('error'); // family needs a ratio
    expect(await createCustomExercise(db, { ...base, family: 'vertical-press', familyRatio: 0 })).toHaveProperty('error');
    expect(await createCustomExercise(db, base)).toHaveProperty('id');
    expect(await createCustomExercise(db, { ...base, name: 'landmine  PRESS' })).toHaveProperty('error');
  });

  it('an exercise without a family can never be predicted: it starts with a calibration set', async () => {
    const { id } = (await createCustomExercise(db, base)) as { id: string };
    await db.exerciseState.put({ exerciseId: 'overhead-press', e1rm: 80, missCount: 0, accessoryFailCount: 0, updatedAt: 5, sessionCount: 3 });
    const snap = await loadSnapshot(db);
    const slot = { slotId: 'tmp', exerciseId: id, progressionStyle: 'repsFirst' as const, group: 1, sets: 3, repMin: 8, repMax: 12 };
    expect(slotPrescription(snap, slot, id)).toMatchObject({ kind: 'calibration', weight: null });
  });

  it('with a family and ratio it is predicted from a relative like any other exercise', async () => {
    const { id } = (await createCustomExercise(db, { ...base, family: 'vertical-press', familyRatio: 0.5 })) as { id: string };
    await db.exerciseState.put({ exerciseId: 'overhead-press', e1rm: 80, missCount: 0, accessoryFailCount: 0, updatedAt: 5, sessionCount: 3 });
    const snap = await loadSnapshot(db);
    const slot = { slotId: 'tmp', exerciseId: id, progressionStyle: 'repsFirst' as const, group: 1, sets: 3, repMin: 8, repMax: 12 };
    const rx = slotPrescription(snap, slot, id);
    expect(rx).toMatchObject({ kind: 'predicted', predictedFrom: 'overhead-press' });
    // 80 × 0.5 × 0.95 = 38 → /(1 + (8+2)/30) = 28.5 → floor to 2.5 = 27.5
    expect(rx.weight).toBe(27.5);
  });

  it('edits a custom exercise; equipment changes re-apply that equipment’s increment; built-ins are protected', async () => {
    const { id } = (await createCustomExercise(db, base)) as { id: string };
    expect(await updateCustomExercise(db, id, { ...base, name: 'Landmine press (neutral)', equipment: 'dumbbell', primaryMuscle: 'chest', defaultProgressionStyle: 'estimatedMax', family: 'horizontal-press', familyRatio: 0.3 })).toEqual({ ok: true });
    expect((await db.exercises.get(id))!).toMatchObject({ name: 'Landmine press (neutral)', equipment: 'dumbbell', increment: 2, primaryMuscle: 'chest', family: 'horizontal-press', familyRatio: 0.3 });
    await updateCustomExercise(db, id, { ...base, name: 'Landmine press (neutral)' }); // family cleared
    const e = (await db.exercises.get(id))!;
    expect(e.family).toBeUndefined();
    expect(e.familyRatio).toBeUndefined();
    expect(await updateCustomExercise(db, 'bench-press', base)).toHaveProperty('error');
    expect(await updateCustomExercise(db, id, { ...base, name: 'Bench press' })).toHaveProperty('error');
  });

  it('keeps working through a unit switch', async () => {
    const { id } = (await createCustomExercise(db, base)) as { id: string };
    await switchUnits(db, 'lb');
    expect((await db.exercises.get(id))!.increment).toBe(5);
  });
});

describe('deleting and hiding', () => {
  it('deletes a custom exercise that has no logged sets (and its seeded state)', async () => {
    const { id } = (await createCustomExercise(db, base)) as { id: string };
    await db.exerciseState.put({ exerciseId: id, e1rm: 50, missCount: 0, accessoryFailCount: 0, updatedAt: 1, sessionCount: 0 });
    expect(await deleteCustomExercise(db, id)).toBe('deleted');
    expect(await db.exercises.get(id)).toBeUndefined();
    expect(await db.exerciseState.get(id)).toBeUndefined();
  });

  it('refuses when sets are logged (hide instead) or a program still uses it; never deletes built-ins', async () => {
    const { id } = (await createCustomExercise(db, base)) as { id: string };
    const day = (await db.programDays.get('A'))!;
    await db.programDays.put({ ...day, slots: [...day.slots, { slotId: 'c1', exerciseId: id, progressionStyle: 'repsFirst', group: 9, sets: 3, repMin: 8, repMax: 12 }] });
    expect(await deleteCustomExercise(db, id)).toBe('in-program');
    await db.programDays.put(day);

    const s = await startSession(db, 'A');
    await saveSet(db, { sessionId: s.id, slotId: 'c1', exerciseId: id, setIndex: 0, weight: 40, reps: 8, rpe: null, prescribedWeight: null, prescriptionKind: 'calibration' });
    expect(await deleteCustomExercise(db, id)).toBe('has-sets');
    expect(await db.exercises.get(id)).toBeDefined();
    expect(await deleteCustomExercise(db, 'bench-press')).toBe('not-custom');
  });

  it('hides and unhides a custom exercise; history still resolves it', async () => {
    const { id } = (await createCustomExercise(db, base)) as { id: string };
    await setExerciseHidden(db, id, true);
    expect((await loadSnapshot(db)).exercises[id].hidden).toBe(true);
    await setExerciseHidden(db, id, false);
    expect((await loadSnapshot(db)).exercises[id].hidden).toBe(false);
    await setExerciseHidden(db, 'bench-press', true); // built-ins are not hideable
    expect((await db.exercises.get('bench-press'))!.hidden).toBe(false);
  });
});
