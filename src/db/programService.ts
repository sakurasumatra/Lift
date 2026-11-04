import { instantiateTemplate } from '../data/library';
import type { Program, ProgramDay, SlotDef } from '../engine';
import type { LiftDB } from './db';

export const MAX_DAYS = 7;
const uid = () => crypto.randomUUID();
const DAY_LETTERS = 'ABCDEFG';

const defaultDayName = (days: { name: string }[]) => {
  for (const l of DAY_LETTERS) if (!days.some((d) => d.name === `Day ${l}`)) return `Day ${l}`;
  return `Day ${days.length + 1}`;
};

const blankDay = (programId: string, days: ProgramDay[]): ProgramDay => ({
  id: uid(), programId, name: defaultDayName(days), order: days.length, slots: [],
});

/** True when an unfinished workout is on one of these days. */
async function hasOpenSession(db: LiftDB, dayIds: string[]): Promise<boolean> {
  return (await db.sessions.toArray()).some((s) => s.finishedAt == null && dayIds.includes(s.dayId));
}

const clean = (name: string, fallback: string) => name.trim().slice(0, 60) || fallback;

/** New program: "blank" (one empty day) or a fresh copy of the 3-day template. The first program becomes active. */
export async function createProgram(db: LiftDB, name: string, from: 'blank' | 'template'): Promise<string> {
  return db.transaction('rw', db.programs, db.programDays, db.settings, async () => {
    const id = uid();
    await db.programs.add({ id, name: clean(name, from === 'blank' ? 'New program' : '3-day template'), createdAt: Date.now(), isTemplate: from === 'template' });
    await db.programDays.bulkAdd(from === 'template' ? instantiateTemplate(id, uid) : [blankDay(id, [])]);
    const s = (await db.settings.get('main'))!;
    if (!s.activeProgramId) await db.settings.update('main', { activeProgramId: id });
    return id;
  });
}

export async function renameProgram(db: LiftDB, id: string, name: string): Promise<void> {
  const p = await db.programs.get(id);
  if (p) await db.programs.update(id, { name: clean(name, p.name) });
}

/** Copy a program with new day and slot ids. History and slot state stay with the original slots. */
export async function duplicateProgram(db: LiftDB, id: string): Promise<string> {
  return db.transaction('rw', db.programs, db.programDays, async () => {
    const src = (await db.programs.get(id))!;
    const days = await db.programDays.where('programId').equals(id).sortBy('order');
    const copyId = uid();
    await db.programs.add({ id: copyId, name: `${src.name} (copy)`.slice(0, 60), createdAt: Date.now(), isTemplate: src.isTemplate });
    await db.programDays.bulkAdd(days.map((d) => ({ ...d, id: uid(), programId: copyId, slots: d.slots.map((s) => ({ ...s, slotId: uid() })) })));
    return copyId;
  });
}

/** Delete a program and its days and slot state. Not allowed while it's active. Workout history is never touched. */
export async function deleteProgram(db: LiftDB, id: string): Promise<'deleted' | 'active' | 'in-use'> {
  return db.transaction('rw', db.programs, db.programDays, db.slotState, db.settings, db.sessions, async () => {
    if ((await db.settings.get('main'))?.activeProgramId === id) return 'active';
    const days = await db.programDays.where('programId').equals(id).toArray();
    if (await hasOpenSession(db, days.map((d) => d.id))) return 'in-use'; // a workout in progress still needs its day
    await db.slotState.bulkDelete(days.flatMap((d) => d.slots.map((s) => s.slotId)));
    await db.programDays.bulkDelete(days.map((d) => d.id));
    await db.programs.delete(id);
    return 'deleted';
  });
}

/** Make a program the one Home rotates through. Exercise state and the return phase are untouched. */
export async function setActiveProgram(db: LiftDB, id: string): Promise<void> {
  if (await db.programs.get(id)) await db.settings.update('main', { activeProgramId: id });
}

export async function addDay(db: LiftDB, programId: string): Promise<string | null> {
  return db.transaction('rw', db.programDays, async () => {
    const days = await db.programDays.where('programId').equals(programId).sortBy('order');
    if (days.length >= MAX_DAYS) return null;
    const day = blankDay(programId, days);
    await db.programDays.add(day);
    return day.id;
  });
}

/** Remove a day (a program keeps at least one) along with its slot state. Past sessions keep their records. */
export async function removeDay(db: LiftDB, dayId: string): Promise<boolean> {
  return db.transaction('rw', db.programDays, db.slotState, db.sessions, async () => {
    const day = await db.programDays.get(dayId);
    if (!day || (await hasOpenSession(db, [dayId]))) return false;
    const days = await db.programDays.where('programId').equals(day.programId).sortBy('order');
    if (days.length <= 1) return false;
    await db.slotState.bulkDelete(day.slots.map((s) => s.slotId));
    await db.programDays.delete(dayId);
    await db.programDays.bulkPut(days.filter((d) => d.id !== dayId).map((d, i) => ({ ...d, order: i })));
    return true;
  });
}

export async function renameDay(db: LiftDB, dayId: string, name: string): Promise<void> {
  const d = await db.programDays.get(dayId);
  if (d) await db.programDays.update(dayId, { name: clean(name, d.name) });
}

/** Swap a day with its neighbour; the rotation follows this order. */
export async function moveDay(db: LiftDB, dayId: string, dir: -1 | 1): Promise<void> {
  await db.transaction('rw', db.programDays, async () => {
    const day = await db.programDays.get(dayId);
    if (!day) return;
    const days = await db.programDays.where('programId').equals(day.programId).sortBy('order');
    const i = days.findIndex((d) => d.id === dayId);
    const j = i + dir;
    if (j < 0 || j >= days.length) return;
    [days[i], days[j]] = [days[j], days[i]];
    await db.programDays.bulkPut(days.map((d, k) => ({ ...d, order: k })));
  });
}

export const newSlotId = uid;

export type { Program, SlotDef };
