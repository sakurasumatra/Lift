import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LiftDB, ensureSeeded } from './db';
import {
  addDay, createProgram, deleteProgram, duplicateProgram, MAX_DAYS, moveDay, removeDay, renameDay, renameProgram, setActiveProgram,
} from './programService';
import { applyOnboarding, finishSession, loadSnapshot, nextDayId, saveSet, startSession } from './service';
import { saveProgramDay } from './settingsService';
import { addSlot } from '../engine';

let db: LiftDB;
beforeEach(async () => {
  db = new LiftDB(`test-${Math.random()}`);
  await ensureSeeded(db);
});

async function days(programId: string) {
  return db.programDays.where('programId').equals(programId).sortBy('order');
}
async function logSet(sessionId: string, slotId: string, exerciseId: string) {
  await saveSet(db, { sessionId, slotId, exerciseId, setIndex: 0, weight: 60, reps: 8, rpe: 8, prescribedWeight: 60, prescriptionKind: 'normal' });
}

describe('programs', () => {
  it('a fresh install has one active program: the 3-day template', async () => {
    const snap = await loadSnapshot(db);
    expect(snap.programs).toHaveLength(1);
    expect(snap.activeProgram?.id).toBe(snap.settings.activeProgramId);
    expect(snap.activeDays.map((d) => d.name)).toEqual(['Day A', 'Day B', 'Day C']);
  });

  it('Blank makes one empty day; the first program becomes active when none is', async () => {
    await db.settings.update('main', { activeProgramId: null });
    const id = await createProgram(db, '  Push pull  ', 'blank');
    const [d, ...rest] = await days(id);
    expect(rest).toEqual([]);
    expect(d).toMatchObject({ name: 'Day A', slots: [] });
    expect((await db.programs.get(id))!).toMatchObject({ name: 'Push pull', isTemplate: false });
    expect((await db.settings.get('main'))!.activeProgramId).toBe(id);
  });

  it('a blank program does not steal the active slot from the current one', async () => {
    const before = (await db.settings.get('main'))!.activeProgramId;
    await createProgram(db, '', 'blank');
    expect((await db.settings.get('main'))!.activeProgramId).toBe(before);
  });

  it('Start from template copies it with new ids, so editing the copy leaves the original alone', async () => {
    const id = await createProgram(db, 'Copy', 'template');
    const copy = await days(id);
    expect(copy.map((d) => d.name)).toEqual(['Day A', 'Day B', 'Day C']);
    expect(copy.map((d) => d.slots.length)).toEqual([5, 5, 5]);
    const original = await days('p-mine');
    const ids = new Set([...original, ...copy].flatMap((d) => [d.id, ...d.slots.map((s) => s.slotId)]));
    expect(ids.size).toBe(2 * (3 + 15));
    await saveProgramDay(db, copy[0].id, copy[0].slots.slice(1));
    expect((await days('p-mine'))[0].slots).toHaveLength(5);
    expect((await days(id))[0].slots).toHaveLength(4);
  });

  it('renames and duplicates (new day and slot ids, same contents)', async () => {
    await renameProgram(db, 'p-mine', 'Mine');
    expect((await db.programs.get('p-mine'))!.name).toBe('Mine');
    await renameProgram(db, 'p-mine', '   ');
    expect((await db.programs.get('p-mine'))!.name).toBe('Mine'); // blank names are ignored
    const dup = await duplicateProgram(db, 'p-mine');
    expect((await db.programs.get(dup))!.name).toBe('Mine (copy)');
    const [a, b] = [await days('p-mine'), await days(dup)];
    expect(b.map((d) => d.slots.map((s) => [s.exerciseId, s.sets, s.progressionStyle]))).toEqual(a.map((d) => d.slots.map((s) => [s.exerciseId, s.sets, s.progressionStyle])));
    expect(b[0].id).not.toBe(a[0].id);
    expect(b[0].slots[0].slotId).not.toBe(a[0].slots[0].slotId);
  });

  it('cannot delete the active program; deleting another removes its days and slot state but never history', async () => {
    expect(await deleteProgram(db, 'p-mine')).toBe('active');
    expect(await db.programs.count()).toBe(1);

    const other = await createProgram(db, 'Other', 'template');
    const [otherDay] = await days(other);
    await db.slotState.put({ slotId: otherDay.slots[0].slotId, nextWeight: 50, reason: 'x', prescriptionKind: 'normal' });
    // a session was once done on that day
    await db.sessions.put({ id: 'old', dayId: otherDay.id, dayName: otherDay.name, startedAt: 1, finishedAt: 2, swaps: [] });
    await logSet('old', otherDay.slots[0].slotId, otherDay.slots[0].exerciseId);

    expect(await deleteProgram(db, other)).toBe('deleted');
    expect(await db.programs.get(other)).toBeUndefined();
    expect(await days(other)).toEqual([]);
    expect(await db.slotState.get(otherDay.slots[0].slotId)).toBeUndefined();
    expect(await db.sessions.get('old')).toBeDefined();
    expect(await db.sets.count()).toBe(1);
  });

  it('switching the active program keeps exercise state and does not restart the return phase', async () => {
    await applyOnboarding(db, { bodyweight: 80, returningAfterBreak: true, entries: [{ exerciseId: 'bench-press', weight: 60, reps: 5, ago: '1-3' }] });
    await db.settings.update('main', { returnPhase: { active: true, sessionsCompleted: 5 } });
    const stateBefore = await db.exerciseState.toArray();
    const other = await createProgram(db, 'Other', 'blank');
    await setActiveProgram(db, other);
    const snap = await loadSnapshot(db);
    expect(snap.activeProgram?.id).toBe(other);
    expect(snap.settings.returnPhase).toEqual({ active: true, sessionsCompleted: 5 });
    expect(await db.exerciseState.toArray()).toEqual(stateBefore);
  });
});

describe('programs and days with a workout in progress', () => {
  it('refuses to delete a program, or a day, that an unfinished workout is on', async () => {
    const other = await createProgram(db, 'Other', 'template');
    const [d] = await days(other);
    const s = await startSession(db, d.id);
    expect(await deleteProgram(db, other)).toBe('in-use');
    expect(await removeDay(db, d.id)).toBe(false);
    expect(await days(other)).toHaveLength(3);
    await finishSession(db, s.id, true);
    expect(await removeDay(db, d.id)).toBe(true);
    expect(await deleteProgram(db, other)).toBe('deleted');
  });
});

describe('days', () => {
  it('names new days Day A, Day B…, fills gaps, and stops at 7', async () => {
    const id = await createProgram(db, 'P', 'blank');
    for (let i = 0; i < MAX_DAYS - 1; i++) expect(await addDay(db, id)).toBeTruthy();
    expect((await days(id)).map((d) => d.name)).toEqual(['Day A', 'Day B', 'Day C', 'Day D', 'Day E', 'Day F', 'Day G']);
    expect(await addDay(db, id)).toBeNull();
    expect(await days(id)).toHaveLength(7);
  });

  it('removes a day (keeping at least one), renumbering order and dropping its slot state', async () => {
    const [a, b, c] = await days('p-mine');
    await db.slotState.put({ slotId: b.slots[0].slotId, nextWeight: 80, reason: 'x', prescriptionKind: 'normal' });
    expect(await removeDay(db, b.id)).toBe(true);
    expect((await days('p-mine')).map((d) => [d.id, d.order])).toEqual([[a.id, 0], [c.id, 1]]);
    expect(await db.slotState.get(b.slots[0].slotId)).toBeUndefined();
    expect(await removeDay(db, a.id)).toBe(true);
    expect(await removeDay(db, c.id)).toBe(false); // the last day stays
    expect(await days('p-mine')).toHaveLength(1);
  });

  it('renames and reorders days', async () => {
    await renameDay(db, 'A', 'Push');
    expect((await db.programDays.get('A'))!.name).toBe('Push');
    await renameDay(db, 'A', '');
    expect((await db.programDays.get('A'))!.name).toBe('Push');
    await moveDay(db, 'C', -1);
    expect((await days('p-mine')).map((d) => d.id)).toEqual(['A', 'C', 'B']);
    await moveDay(db, 'A', -1); // already first
    expect((await days('p-mine')).map((d) => d.id)).toEqual(['A', 'C', 'B']);
  });
});

describe('rotation follows the active program', () => {
  it('uses the reordered day order', async () => {
    await moveDay(db, 'C', -1); // A, C, B
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const s = await startSession(db);
      seen.push(s.dayId);
      await finishSession(db, s.id, true);
    }
    expect(seen).toEqual(['A', 'C', 'B', 'A']);
  });

  it('starts a newly activated program at its first day, then rotates through it', async () => {
    const s = await startSession(db);
    await finishSession(db, s.id, true); // finished day A of the template
    const other = await createProgram(db, 'Two-day', 'blank');
    const d2 = await addDay(db, other);
    const [d1] = await days(other);
    await setActiveProgram(db, other);
    expect(await nextDayId(db)).toBe(d1.id);
    const t = await startSession(db);
    expect(t.dayName).toBe('Day A');
    await finishSession(db, t.id, true);
    expect(await nextDayId(db)).toBe(d2);
  });

  it('is null with no active program or no days; starting a session then fails clearly', async () => {
    await db.settings.update('main', { activeProgramId: null });
    expect(await nextDayId(db)).toBeNull();
    await expect(startSession(db)).rejects.toThrow(/no program day/i);
  });

  it('records the day name on the session so renaming or deleting the day does not rewrite history', async () => {
    const s = await startSession(db, 'A');
    expect(s.dayName).toBe('Day A');
    await renameDay(db, 'A', 'Legs');
    expect((await db.sessions.get(s.id))!.dayName).toBe('Day A');
  });
});

describe('slots in a user-built program', () => {
  it('a slot added with a new id and a chosen style trains and progresses', async () => {
    const id = await createProgram(db, 'Mine', 'blank');
    const [day] = await days(id);
    await saveProgramDay(db, day.id, addSlot([], 'incline-bench-press', { slotId: 'slot-1', progressionStyle: 'estimatedMax' }));
    await setActiveProgram(db, id);
    const s = await startSession(db);
    expect(s.dayId).toBe(day.id);
    for (let i = 0; i < 3; i++) {
      await saveSet(db, { sessionId: s.id, slotId: 'slot-1', exerciseId: 'incline-bench-press', setIndex: i, weight: 60, reps: 6, rpe: 8, prescribedWeight: null, prescriptionKind: 'calibration' });
    }
    const done = await finishSession(db, s.id, false);
    const snap = await loadSnapshot(db);
    expect(snap.exerciseStates['incline-bench-press'].sessionCount).toBe(1);
    expect(snap.slotStates['slot-1']).toBeDefined();
    expect(done.summary!.items[0].slotId).toBe('slot-1');
  });

  it('changing a slot’s progression style resets its prescription', async () => {
    await db.slotState.put({ slotId: 'A2', nextWeight: 80, reason: 'x', prescriptionKind: 'normal' });
    const day = (await db.programDays.get('A'))!;
    await saveProgramDay(db, 'A', day.slots.map((s) => (s.slotId === 'A2' ? { ...s, progressionStyle: 'repsFirst' as const } : s)));
    expect(await db.slotState.get('A2')).toBeUndefined();
  });
});
