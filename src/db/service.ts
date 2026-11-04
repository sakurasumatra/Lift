import type { ExerciseDef, ExerciseState, Program, SlotDef, SlotState } from '../engine';
import { finishSessionState, seedExercise, type TimeAgo } from '../engine';
import type { LiftDB } from './db';
import { saveProgramDay } from './settingsService';
import type { ProgramDayRow, SessionRow, SetRow, SettingsRow } from './schema';

export interface Snapshot {
  settings: SettingsRow;
  /** Every exercise, hidden ones included (history still resolves them). */
  exercises: Record<string, ExerciseDef>;
  programs: Program[];
  activeProgram: Program | null;
  /** Every day of every program: session history and deloads reach slots outside the active program. */
  days: ProgramDayRow[];
  /** The active program's days in rotation order. */
  activeDays: ProgramDayRow[];
  exerciseStates: Record<string, ExerciseState>;
  slotStates: Record<string, SlotState>;
}

const byId = <T,>(rows: T[], key: (r: T) => string) => Object.fromEntries(rows.map((r) => [key(r), r]));

export async function loadSnapshot(db: LiftDB): Promise<Snapshot> {
  const [settings, exercises, programs, days, exerciseStates, slotStates] = await Promise.all([
    db.settings.get('main'),
    db.exercises.toArray(),
    db.programs.orderBy('createdAt').toArray(),
    db.programDays.orderBy('order').toArray(),
    db.exerciseState.toArray(),
    db.slotState.toArray(),
  ]);
  const activeProgram = programs.find((p) => p.id === settings?.activeProgramId) ?? null;
  return {
    settings: settings!,
    exercises: byId(exercises, (e) => e.id),
    programs,
    activeProgram,
    days,
    activeDays: activeProgram ? days.filter((d) => d.programId === activeProgram.id) : [],
    exerciseStates: byId(exerciseStates, (s) => s.exerciseId),
    slotStates: byId(slotStates, (s) => s.slotId),
  };
}

/**
 * The active program's day after the most recently finished session (early-ended sessions count); its first
 * day when nothing has been finished in it yet. Null when there's no active program or it has no days.
 */
export async function nextDayId(db: LiftDB): Promise<string | null> {
  const activeId = (await db.settings.get('main'))?.activeProgramId;
  if (!activeId) return null;
  const days = await db.programDays.where('programId').equals(activeId).sortBy('order');
  if (!days.length) return null;
  const finished = (await db.sessions.where('finishedAt').above(0).sortBy('finishedAt')).pop();
  if (!finished) return days[0].id;
  const idx = days.findIndex((d) => d.id === finished.dayId);
  return days[(idx + 1) % days.length].id; // a last session from another program (idx −1) starts this one at day 1
}

export async function activeSession(db: LiftDB): Promise<SessionRow | undefined> {
  const open = (await db.sessions.toArray()).filter((s) => s.finishedAt == null);
  return open.sort((a, b) => b.startedAt - a.startedAt)[0];
}

export async function startSession(db: LiftDB, dayId?: string): Promise<SessionRow> {
  const existing = await activeSession(db);
  if (existing) return existing;
  const target = dayId ?? (await nextDayId(db));
  if (!target) throw new Error('There is no program day to start.');
  const row: SessionRow = {
    id: crypto.randomUUID(),
    dayId: target,
    dayName: (await db.programDays.get(target))?.name,
    startedAt: Date.now(),
    swaps: [],
  };
  await db.sessions.add(row);
  return row;
}

export const setRowId = (sessionId: string, slotId: string, setIndex: number) => `${sessionId}:${slotId}:${setIndex}`;

/** Insert or overwrite the set at (session, slot, index). */
export async function saveSet(db: LiftDB, row: Omit<SetRow, 'id' | 'completedAt'> & { completedAt?: number }): Promise<void> {
  await db.sets.put({ ...row, id: setRowId(row.sessionId, row.slotId, row.setIndex), completedAt: row.completedAt ?? Date.now() });
}

export async function setsForSession(db: LiftDB, sessionId: string): Promise<SetRow[]> {
  return (await db.sets.where('sessionId').equals(sessionId).toArray()).sort((a, b) => a.completedAt - b.completedAt);
}

/** Finish a session: run the engine, persist new states, summary and the return-phase counter. */
export async function finishSession(db: LiftDB, sessionId: string, endedEarly: boolean): Promise<SessionRow> {
  return db.transaction('rw', db.tables, async () => {
    const session = (await db.sessions.get(sessionId))!;
    const snap = await loadSnapshot(db);
    const sets = await setsForSession(db, sessionId);
    const allSlots: SlotDef[] = snap.days.flatMap((d) => d.slots);
    const result = finishSessionState({
      sets,
      allSlots,
      exercises: snap.exercises,
      exerciseStates: snap.exerciseStates,
      slotStates: snap.slotStates,
      bodyweight: snap.settings.bodyweight ?? 0,
      unit: snap.settings.units,
      returnPhase: snap.settings.returnPhase,
      now: Date.now(),
    });
    await db.exerciseState.bulkPut(Object.values(result.exerciseStates));
    await db.slotState.bulkPut(Object.values(result.slotStates));
    await db.settings.update('main', { returnPhase: result.returnPhase });
    const done: SessionRow = {
      ...session,
      finishedAt: Date.now(),
      endedEarly,
      summary: {
        items: result.summary,
        stronger: result.stronger,
        deloaded: result.deloaded,
        totalSets: sets.length,
        returnSessionNumber: snap.settings.returnPhase.active ? snap.settings.returnPhase.sessionsCompleted + 1 : null,
      },
    };
    await db.sessions.put(done);
    return done;
  });
}

/**
 * Swap sheet → "Make permanent": the program slot gets the new exercise (through saveProgramDay, so
 * the old exercise's slot state is dropped) and the session no longer needs a one-off swap for it.
 */
export async function makeSwapPermanent(db: LiftDB, sessionId: string, slotId: string, exerciseId: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.programDays, db.slotState, async () => {
    const session = (await db.sessions.get(sessionId))!;
    const day = (await db.programDays.get(session.dayId))!;
    await saveProgramDay(db, day.id, day.slots.map((s) => (s.slotId === slotId ? { ...s, exerciseId } : s)));
    await db.sessions.update(sessionId, { swaps: session.swaps.filter((s) => s.slotId !== slotId) });
  });
}

/** Abandon a session with nothing logged. */
export async function discardSession(db: LiftDB, sessionId: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sets.where('sessionId').equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

export interface SeedEntry { exerciseId: string; weight: number; reps: number; ago: TimeAgo; }

/**
 * Onboarding: store the bodyweight, the return-phase choice and a seeded exerciseState per remembered lift.
 * Exercises that already have logged sessions are left alone.
 */
export async function applyOnboarding(
  db: LiftDB,
  input: { bodyweight: number | null; returningAfterBreak: boolean; entries: SeedEntry[] },
): Promise<number> {
  return db.transaction('rw', db.settings, db.exercises, db.exerciseState, async () => {
    const settings = (await db.settings.get('main'))!;
    const bodyweight = input.bodyweight ?? settings.bodyweight ?? 0;
    const now = Date.now();
    let seeded = 0;
    for (const e of input.entries) {
      const ex = await db.exercises.get(e.exerciseId);
      if (!ex || !(e.reps > 0)) continue;
      // A bodyweight lift's e1RM needs the bodyweight; without it, leave it to a calibration set.
      if (ex.equipment === 'bodyweight' && !(bodyweight > 0)) continue;
      const existing = await db.exerciseState.get(e.exerciseId);
      if (existing && existing.sessionCount > 0) continue;
      await db.exerciseState.put(seedExercise(ex, e.weight, e.reps, e.ago, bodyweight, now));
      seeded++;
    }
    await db.settings.update('main', {
      bodyweight: input.bodyweight ?? settings.bodyweight,
      onboarded: true,
      returnPhase: input.returningAfterBreak
        ? settings.returnPhase.sessionsCompleted === 0 ? { active: true, sessionsCompleted: 0 } : settings.returnPhase
        : { ...settings.returnPhase, active: false },
    });
    return seeded;
  });
}

export async function skipOnboarding(db: LiftDB): Promise<void> {
  await db.settings.update('main', { onboarded: true });
}
