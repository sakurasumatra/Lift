import { slug } from '../data/library';
import type { Equipment, ExerciseDef, FamilyId, MuscleGroup, ProgressionStyle } from '../engine';
import type { LiftDB } from './db';

export interface CustomExerciseInput {
  name: string;
  equipment: Equipment;
  primaryMuscle: MuscleGroup;
  defaultProgressionStyle: ProgressionStyle;
  family?: FamilyId;
  familyRatio?: number;
}

const normalise = (name: string) => name.trim().replace(/\s+/g, ' ');

async function nameTaken(db: LiftDB, name: string, exceptId?: string): Promise<boolean> {
  const lower = name.toLowerCase();
  return (await db.exercises.toArray()).some((e) => e.id !== exceptId && e.name.toLowerCase() === lower);
}

function validate(input: CustomExerciseInput): string | null {
  if (!normalise(input.name)) return 'Give the exercise a name.';
  if (input.family && !(input.familyRatio != null && input.familyRatio > 0)) return 'Enter a ratio above 0 for the movement family.';
  return null;
}

/** Create a user-defined exercise. It behaves exactly like a built-in one. Returns its id, or an error message. */
export async function createCustomExercise(db: LiftDB, input: CustomExerciseInput): Promise<{ id: string } | { error: string }> {
  const error = validate(input);
  if (error) return { error };
  const name = normalise(input.name);
  return db.transaction('rw', db.exercises, db.settings, async () => {
    if (await nameTaken(db, name)) return { error: 'An exercise with that name already exists.' };
    const settings = (await db.settings.get('main'))!;
    let id = `custom-${slug(name)}`;
    while (await db.exercises.get(id)) id += `-${Math.floor(Math.random() * 10)}`;
    const ex: ExerciseDef = {
      id, name,
      equipment: input.equipment,
      increment: settings.increments[input.equipment],
      primaryMuscle: input.primaryMuscle,
      defaultProgressionStyle: input.defaultProgressionStyle,
      ...(input.family ? { family: input.family, familyRatio: input.familyRatio } : {}),
      isCustom: true,
      hidden: false,
    };
    await db.exercises.add(ex);
    return { id };
  });
}

/** Edit a custom exercise. Changing equipment re-applies that equipment's increment. */
export async function updateCustomExercise(db: LiftDB, id: string, input: CustomExerciseInput): Promise<{ ok: true } | { error: string }> {
  const error = validate(input);
  if (error) return { error };
  const name = normalise(input.name);
  return db.transaction('rw', db.exercises, db.settings, async () => {
    const ex = await db.exercises.get(id);
    if (!ex?.isCustom) return { error: 'Only custom exercises can be edited here.' };
    if (await nameTaken(db, name, id)) return { error: 'An exercise with that name already exists.' };
    const settings = (await db.settings.get('main'))!;
    const next: ExerciseDef = {
      ...ex, name,
      equipment: input.equipment,
      increment: input.equipment === ex.equipment ? ex.increment : settings.increments[input.equipment],
      primaryMuscle: input.primaryMuscle,
      defaultProgressionStyle: input.defaultProgressionStyle,
      family: input.family,
      familyRatio: input.family ? input.familyRatio : undefined,
    };
    if (!next.family) { delete next.family; delete next.familyRatio; }
    await db.exercises.put(next);
    return { ok: true } as const;
  });
}

/**
 * Delete a custom exercise. Refused when it has logged sets (hide it instead, so history still resolves)
 * or when a program slot still uses it.
 */
export async function deleteCustomExercise(db: LiftDB, id: string): Promise<'deleted' | 'has-sets' | 'in-program' | 'not-custom'> {
  return db.transaction('rw', db.exercises, db.sets, db.programDays, db.exerciseState, async () => {
    const ex = await db.exercises.get(id);
    if (!ex?.isCustom) return 'not-custom';
    if ((await db.sets.where('exerciseId').equals(id).count()) > 0) return 'has-sets';
    if ((await db.programDays.toArray()).some((d) => d.slots.some((s) => s.exerciseId === id))) return 'in-program';
    await db.exerciseState.delete(id);
    await db.exercises.delete(id);
    return 'deleted';
  });
}

export async function setExerciseHidden(db: LiftDB, id: string, hidden: boolean): Promise<void> {
  const ex = await db.exercises.get(id);
  if (ex?.isCustom) await db.exercises.update(id, { hidden });
}
