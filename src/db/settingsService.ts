import type { Equipment, ExerciseDef, RestTimes, SlotDef, Unit } from '../engine';
import { DEFAULT_INCREMENTS, convertLogged, convertRounded, convertWeight, clean, floorToIncrement, minLoad } from '../engine';
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
    const exById = new Map<string, ExerciseDef>();
    for (const e of exercises) { e.increment = increments[e.equipment]; exById.set(e.id, e); }
    await db.exercises.bulkPut(exercises);
    // A prescription in the new unit: rounded down to the new increment, but never below the empty bar
    // (20 kg is 44.09 lb, which would otherwise round down to 40 lb).
    const rx = (value: number, exerciseId: string | undefined): number => {
      const ex = exerciseId ? exById.get(exerciseId) : undefined;
      const w = convertRounded(value, from, to, ex?.increment ?? 1);
      return ex ? Math.max(w, minLoad(ex.equipment, to)) : w;
    };

    const exStates = await db.exerciseState.toArray();
    await db.exerciseState.bulkPut(exStates.map((s) => ({
      ...s,
      e1rm: clean(convertWeight(s.e1rm, from, to)),
      lastWeight: s.lastWeight == null ? undefined : rx(s.lastWeight, s.exerciseId),
      nextWeight: s.nextWeight == null ? undefined : rx(s.nextWeight, s.exerciseId),
    })));

    const days = await db.programDays.toArray();
    const slotEx = new Map<string, string>(days.flatMap((d) => d.slots.map((s) => [s.slotId, s.exerciseId] as [string, string])));
    const slotStates = await db.slotState.toArray();
    await db.slotState.bulkPut(slotStates.map((s) => {
      const exId = slotEx.get(s.slotId);
      return {
        ...s,
        nextWeight: rx(s.nextWeight, exId),
        lastPrescribedWeight: s.lastPrescribedWeight == null ? undefined : rx(s.lastPrescribedWeight, exId),
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
          nextWeight: it.nextWeight == null ? null : rx(it.nextWeight, it.exerciseId),
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

/**
 * Pull-ups and other bodyweight lifts store their prescriptions as added load (negative = assistance), worked
 * out with the bodyweight at the time. When the bodyweight changes, shift them so the total load stays the same:
 * 2 kg heavier → 2 kg less added load (or 2 kg more assistance), rounded down to the increment. The e1RM is
 * already total load, so it doesn't change. Must run inside a transaction covering exercises, programDays,
 * slotState and exerciseState.
 */
export async function rebaseBodyweightPrescriptions(db: LiftDB, oldBw: number | null, newBw: number | null): Promise<void> {
  if (oldBw == null || newBw == null || oldBw === newBw) return;
  const shift = oldBw - newBw;
  const inc = new Map((await db.exercises.toArray()).filter((e) => e.equipment === 'bodyweight').map((e) => [e.id, e.increment]));
  if (!inc.size) return;
  const moved = (v: number, exId: string) => floorToIncrement(v + shift, inc.get(exId)!);
  const note = ' · adjusted for your new bodyweight';

  const exStates = (await db.exerciseState.toArray()).filter((s) => inc.has(s.exerciseId));
  await db.exerciseState.bulkPut(exStates.map((s) => ({
    ...s,
    lastWeight: s.lastWeight == null ? undefined : moved(s.lastWeight, s.exerciseId),
    nextWeight: s.nextWeight == null ? undefined : moved(s.nextWeight, s.exerciseId),
  })));

  const slotEx = new Map((await db.programDays.toArray()).flatMap((d) => d.slots.map((s) => [s.slotId, s.exerciseId] as [string, string])));
  const slotStates = (await db.slotState.toArray()).filter((s) => inc.has(slotEx.get(s.slotId) ?? ''));
  await db.slotState.bulkPut(slotStates.map((s) => {
    const exId = slotEx.get(s.slotId)!;
    return {
      ...s,
      nextWeight: moved(s.nextWeight, exId),
      lastPrescribedWeight: s.lastPrescribedWeight == null ? undefined : moved(s.lastPrescribedWeight, exId),
      lastWorkingWeight: s.lastWorkingWeight == null ? undefined : clean(s.lastWorkingWeight + shift),
      reason: s.reason.endsWith(note) ? s.reason : s.reason + note,
    };
  }));
}

/** Save the bodyweight; pull-up (and other bodyweight-lift) prescriptions follow it. */
export async function setBodyweight(db: LiftDB, value: number | null): Promise<void> {
  await db.transaction('rw', db.settings, db.exercises, db.programDays, db.slotState, db.exerciseState, async () => {
    const old = (await db.settings.get('main'))!.bodyweight;
    await rebaseBodyweightPrescriptions(db, old, value);
    await db.settings.update('main', { bodyweight: value });
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

/** Edit an exercise's equipment (the change also applies that equipment's increment). */
export async function updateExercise(db: LiftDB, id: string, patch: Partial<Pick<ExerciseDef, 'equipment'>>): Promise<void> {
  const s = (await db.settings.get('main'))!;
  const next: Partial<ExerciseDef> = { ...patch };
  if (patch.equipment) next.increment = s.increments[patch.equipment];
  await db.exercises.update(id, next);
}

/**
 * Save a day's slots. Slots that were removed lose their slot state, and so do slots whose exercise
 * rep range or progression style changed (a prescription for the old exercise or range doesn't fit the new one; the
 * next one comes from the exercise's e1RM or last weight). Reordering, regrouping and set counts keep it.
 */
export async function saveProgramDay(db: LiftDB, dayId: string, slots: SlotDef[]): Promise<void> {
  await db.transaction('rw', db.programDays, db.slotState, async () => {
    const day = (await db.programDays.get(dayId))!;
    const before = new Map(day.slots.map((s) => [s.slotId, s]));
    const stale = [...before.keys()].filter((id) => {
      const now = slots.find((s) => s.slotId === id);
      const was = before.get(id)!;
      return !now || now.exerciseId !== was.exerciseId || now.repMin !== was.repMin || now.repMax !== was.repMax
        || now.progressionStyle !== was.progressionStyle;
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
