import type { Equipment, ExerciseDef, RestTimes, SlotDef, Unit } from '../engine';
import { DEFAULT_INCREMENTS, convertLogged, convertRounded, convertWeight, clean } from '../engine';
import { buildExerciseLibrary, buildSeedProgram } from '../data/library';
import { ensureSeeded, type LiftDB } from './db';

/**
 * Switch units: converts every stored weight and e1RM, swaps in that unit's default increments,
 * and re-rounds prescriptions down to the new increments. History keeps one decimal.
 */
export async function switchUnits(db: LiftDB, to: Unit): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    const settings = (await db.settings.get('main'))!;
    const from = settings.units;
    if (from === to) return;
    const increments = { ...DEFAULT_INCREMENTS[to] };

    const exercises = await db.exercises.toArray();
    const inc = new Map<string, number>();
    for (const e of exercises) { e.increment = increments[e.equipment]; inc.set(e.id, e.increment); }
    await db.exercises.bulkPut(exercises);

    const exStates = await db.exerciseState.toArray();
    await db.exerciseState.bulkPut(exStates.map((s) => ({
      ...s,
      e1rm: clean(convertWeight(s.e1rm, from, to)),
      lastWeight: s.lastWeight == null ? undefined : convertRounded(s.lastWeight, from, to, inc.get(s.exerciseId) ?? 1),
      nextWeight: s.nextWeight == null ? undefined : convertRounded(s.nextWeight, from, to, inc.get(s.exerciseId) ?? 1),
    })));

    const days = await db.programDays.toArray();
    const slotEx = new Map<string, string>(days.flatMap((d) => d.slots.map((s) => [s.slotId, s.exerciseId] as [string, string])));
    const slotStates = await db.slotState.toArray();
    await db.slotState.bulkPut(slotStates.map((s) => {
      const step = inc.get(slotEx.get(s.slotId) ?? '') ?? 1;
      return {
        ...s,
        nextWeight: convertRounded(s.nextWeight, from, to, step),
        lastPrescribedWeight: s.lastPrescribedWeight == null ? undefined : convertRounded(s.lastPrescribedWeight, from, to, step),
        lastWorkingWeight: s.lastWorkingWeight == null ? undefined : convertLogged(s.lastWorkingWeight, from, to),
        reason: `Converted from ${from} to ${to} and rounded to your ${to} increment`,
      };
    }));

    const sets = await db.sets.toArray();
    await db.sets.bulkPut(sets.map((s) => ({
      ...s,
      weight: convertLogged(s.weight, from, to),
      prescribedWeight: s.prescribedWeight == null ? null : convertLogged(s.prescribedWeight, from, to),
    })));

    // Stored session summaries are shown in History with the current unit label: convert them too.
    const sessions = await db.sessions.toArray();
    await db.sessions.bulkPut(sessions.map((s) => (s.summary ? {
      ...s,
      summary: {
        ...s.summary,
        items: s.summary.items.map((it) => ({
          ...it,
          nextWeight: it.nextWeight == null ? null : convertRounded(it.nextWeight, from, to, inc.get(it.exerciseId) ?? 1),
        })),
        stronger: s.summary.stronger.map((c) => ({
          ...c,
          oldE1rm: clean(convertWeight(c.oldE1rm, from, to)),
          newE1rm: clean(convertWeight(c.newE1rm, from, to)),
          delta: clean(convertWeight(c.delta, from, to)),
        })),
      },
    } : s)));

    await db.settings.update('main', {
      units: to,
      increments,
      bodyweight: settings.bodyweight == null ? null : Math.round(convertWeight(settings.bodyweight, from, to) * 10) / 10,
    });
  });
}

/** Change the increment for one equipment type; applies to every exercise using it. */
export async function setIncrement(db: LiftDB, equipment: Equipment, value: number): Promise<void> {
  if (!(value > 0)) return;
  await db.transaction('rw', db.settings, db.exercises, async () => {
    const s = (await db.settings.get('main'))!;
    await db.settings.update('main', { increments: { ...s.increments, [equipment]: value } });
    await db.exercises.where('id').anyOf((await db.exercises.toArray()).filter((e) => e.equipment === equipment).map((e) => e.id)).modify({ increment: value });
  });
}

export async function setRestTimes(db: LiftDB, rest: RestTimes): Promise<void> {
  await db.settings.update('main', { restTimes: rest });
}

export async function setFamilyRatio(db: LiftDB, exerciseId: string, ratio: number): Promise<void> {
  if (ratio > 0) await db.exercises.update(exerciseId, { familyRatio: ratio });
}

/** Edit an exercise's type/equipment (equipment change also applies that equipment's increment). */
export async function updateExercise(db: LiftDB, id: string, patch: Partial<Pick<ExerciseDef, 'type' | 'equipment'>>): Promise<void> {
  const s = (await db.settings.get('main'))!;
  const next: Partial<ExerciseDef> = { ...patch };
  if (patch.equipment) next.increment = s.increments[patch.equipment];
  await db.exercises.update(id, next);
}

/**
 * Save a day's slots. Slots that were removed lose their slot state, and so do slots whose exercise
 * or rep range changed (a prescription for the old exercise or range doesn't fit the new one; the
 * next one comes from the exercise's e1RM or last weight). Reordering, regrouping and set counts keep it.
 */
export async function saveProgramDay(db: LiftDB, dayId: string, slots: SlotDef[]): Promise<void> {
  await db.transaction('rw', db.programDays, db.slotState, async () => {
    const day = (await db.programDays.get(dayId))!;
    const before = new Map(day.slots.map((s) => [s.slotId, s]));
    const stale = [...before.keys()].filter((id) => {
      const now = slots.find((s) => s.slotId === id);
      const was = before.get(id)!;
      return !now || now.exerciseId !== was.exerciseId || now.repMin !== was.repMin || now.repMax !== was.repMax;
    });
    await db.slotState.bulkDelete(stale);
    await db.programDays.put({ ...day, slots });
  });
}

/** Wipe everything and re-seed (the app returns to onboarding). */
export async function resetAllData(db: LiftDB): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await ensureSeeded(db);
}

export const defaultLibrary = buildExerciseLibrary;
export const defaultProgram = buildSeedProgram;
