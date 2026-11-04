import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { LiftDB } from './db';
import { loadSnapshot } from './service';
import { exportData, importData, validateBackup } from './backup';
import { migrateV1ToV2 } from './migrate';

/** A database exactly as milestones 1–5 left it: version 1 schema, `type` on exercises, `label` on days. */
async function legacyDb(name: string) {
  const old = new Dexie(name);
  old.version(1).stores({
    exercises: 'id, family, type', programDays: 'id, order', slotState: 'slotId',
    sessions: 'id, dayId, startedAt, finishedAt', sets: 'id, sessionId, slotId, exerciseId, [sessionId+slotId], completedAt',
    exerciseState: 'exerciseId', settings: 'id',
  });
  const ex = (id: string, name: string, type: string, equipment: string, family: string, familyRatio: number) =>
    ({ id, name, type, equipment, increment: 2.5, family, familyRatio });
  await old.table('exercises').bulkPut([
    ex('back-squat', 'Back squat', 'main', 'barbell', 'squat', 1),
    ex('bench-press', 'Bench press', 'main', 'barbell', 'horizontal-press', 1),
    ex('lat-pulldown', 'Lat pulldown', 'accessory', 'cable', 'vertical-pull', 1),
  ]);
  await old.table('programDays').bulkPut([{
    id: 'A', label: 'A', order: 0,
    slots: [
      { slotId: 'A1', exerciseId: 'back-squat', group: 1, sets: 4, repMin: 4, repMax: 6 },
      { slotId: 'A2', exerciseId: 'lat-pulldown', group: 2, sets: 3, repMin: 8, repMax: 12 },
    ],
  }, { id: 'B', label: 'B', order: 1, slots: [{ slotId: 'B1', exerciseId: 'bench-press', group: 1, sets: 4, repMin: 4, repMax: 6 }] }]);
  await old.table('slotState').put({ slotId: 'A1', lastPrescribedWeight: 100, nextWeight: 102.5, reason: 'r', prescriptionKind: 'normal' });
  await old.table('sessions').put({ id: 's1', dayId: 'A', startedAt: 1, finishedAt: 2, swaps: [] });
  await old.table('sets').put({ id: 's1:A1:0', sessionId: 's1', slotId: 'A1', exerciseId: 'back-squat', setIndex: 0, weight: 100, reps: 5, rpe: 8, prescribedWeight: 100, prescriptionKind: 'normal', completedAt: 2 });
  await old.table('exerciseState').put({ exerciseId: 'back-squat', e1rm: 130, missCount: 1, accessoryFailCount: 0, updatedAt: 2, sessionCount: 4 });
  await old.table('settings').put({
    id: 'main', units: 'kg', increments: { barbell: 2.5, dumbbell: 2, machine: 2.5, cable: 2.5, bodyweight: 2.5 }, bodyweight: 82,
    restTimes: { pair: 75, main: 180, accessory: 90 }, keepScreenAwake: true, timerSound: true,
    returnPhase: { active: true, sessionsCompleted: 4 }, onboarded: true,
  });
  old.close();
}

describe('database upgrade v1 → v2', () => {
  it('turns the single program into "3-day template (mine)" and keeps all history and state', async () => {
    const name = `legacy-${Math.random()}`;
    await legacyDb(name);
    const db = new LiftDB(name);
    const snap = await loadSnapshot(db);

    expect(snap.programs).toHaveLength(1);
    expect(snap.programs[0]).toMatchObject({ id: 'p-mine', name: '3-day template (mine)' });
    expect(snap.settings.activeProgramId).toBe('p-mine');
    expect(snap.activeDays.map((d) => [d.id, d.name, d.programId])).toEqual([['A', 'Day A', 'p-mine'], ['B', 'Day B', 'p-mine']]);

    // main/accessory type became the slot's progression style; slot ids are untouched
    expect(snap.days[0].slots.map((s) => [s.slotId, s.progressionStyle])).toEqual([['A1', 'estimatedMax'], ['A2', 'repsFirst']]);
    expect(snap.days[1].slots[0]).toMatchObject({ slotId: 'B1', progressionStyle: 'estimatedMax' });
    expect(snap.exercises['lat-pulldown']).toMatchObject({ defaultProgressionStyle: 'repsFirst', primaryMuscle: 'back', isCustom: false, hidden: false });
    expect(snap.exercises['back-squat']).not.toHaveProperty('type');

    // nothing lost
    expect(snap.slotStates.A1).toMatchObject({ lastPrescribedWeight: 100, nextWeight: 102.5 });
    expect(snap.exerciseStates['back-squat']).toMatchObject({ e1rm: 130, missCount: 1, sessionCount: 4 });
    expect(snap.settings.returnPhase).toEqual({ active: true, sessionsCompleted: 4 });
    expect(snap.settings.bodyweight).toBe(82);
    expect(await db.sets.count()).toBe(1);
    expect((await db.sessions.get('s1'))!.dayId).toBe('A');

    // the broader library arrived, without disturbing the user's own rows; new equipment got increments
    expect(Object.keys(snap.exercises).length).toBeGreaterThanOrEqual(150);
    expect(snap.settings.increments).toMatchObject({ kettlebell: 4, band: 2.5, barbell: 2.5 });
    db.close();
  });

  it('keeps a user-edited increment when filling in the new equipment', () => {
    const out = migrateV1ToV2({
      exercises: [{ id: 'x', name: 'X', type: 'main' }], programDays: [],
      settings: [{ id: 'main', units: 'lb', increments: { barbell: 10 } }],
    });
    expect(out.settings[0].increments).toMatchObject({ barbell: 10, dumbbell: 5, kettlebell: 10 });
    expect(out.programs).toEqual([]);
    expect(out.settings[0].activeProgramId).toBeNull();
  });
});

describe('importing an older backup', () => {
  it('upgrades a version 1 backup on import', async () => {
    const name = `legacy-${Math.random()}`;
    await legacyDb(name);
    const v1 = new Dexie(name);
    v1.version(1).stores({ exercises: 'id', programDays: 'id', slotState: 'slotId', sessions: 'id', sets: 'id', exerciseState: 'exerciseId', settings: 'id' });
    const tables: Record<string, unknown[]> = {};
    for (const t of ['exercises', 'programDays', 'slotState', 'sessions', 'sets', 'exerciseState', 'settings']) tables[t] = await v1.table(t).toArray();
    v1.close();
    const file = JSON.parse(JSON.stringify({ app: 'lift', version: 1, exportedAt: 'x', tables }));

    const valid = validateBackup(file);
    expect(valid.version).toBe(2);
    expect(valid.tables.programs).toHaveLength(1);

    const target = new LiftDB(`t-${Math.random()}`);
    await importData(target, file);
    const snap = await loadSnapshot(target);
    expect(snap.activeProgram?.name).toBe('3-day template (mine)');
    expect(snap.days[0].slots[0].progressionStyle).toBe('estimatedMax');
    expect(snap.exerciseStates['back-squat'].e1rm).toBe(130);
    // and it exports as version 2
    expect((await exportData(target)).version).toBe(2);
  });

  it('rejects a backup whose days point at a missing program', async () => {
    const db = new LiftDB(`t-${Math.random()}`);
    const { ensureSeeded } = await import('./db');
    await ensureSeeded(db);
    const f = JSON.parse(JSON.stringify(await exportData(db)));
    f.tables.programs = [];
    expect(() => validateBackup(f)).toThrow(/missing program/);
  });
});
