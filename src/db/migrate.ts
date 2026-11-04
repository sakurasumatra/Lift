import type { Equipment, ExerciseDef, MuscleGroup, Program, ProgramDay, SlotDef, Unit } from '../engine';
import { DEFAULT_INCREMENTS } from '../engine';
import { buildExerciseLibrary, SEED_PROGRAM_ID, SEED_PROGRAM_NAME } from '../data/library';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface V1Data {
  exercises: Row[];
  programDays: Row[];
  settings: Row[];
}

export interface V2Data {
  exercises: Row[];
  programs: Program[];
  programDays: ProgramDay[];
  settings: Row[];
}

/**
 * Version 1 → 2: the single A/B/C program becomes a saved program called "3-day template (mine)", every
 * slot gets the progression style its exercise's old main/accessory type implied, exercises gain a muscle
 * group and the broader library is added. Slot ids, exercise ids and all state are untouched, so history
 * and prescriptions carry straight over. Pure, so the Dexie upgrade and the backup importer share it.
 */
export function migrateV1ToV2(input: V1Data, now = Date.now()): V2Data {
  const settings = input.settings[0] ?? {};
  const unit: Unit = settings.units === 'lb' ? 'lb' : 'kg';
  const increments: Record<Equipment, number> = { ...DEFAULT_INCREMENTS[unit], ...(settings.increments ?? {}) };
  const library = buildExerciseLibrary(unit);
  const byId = new Map(library.map((e) => [e.id, e]));

  const oldType = new Map<string, string>(input.exercises.map((e) => [e.id, e.type]));
  const exercises: Row[] = input.exercises.map((e) => {
    const { type, ...rest } = e;
    const lib = byId.get(e.id);
    return {
      ...rest,
      defaultProgressionStyle: type === 'main' ? 'estimatedMax' : 'repsFirst',
      primaryMuscle: (lib?.primaryMuscle ?? 'full-body') as MuscleGroup,
      isCustom: false,
      hidden: false,
      ...(lib?.imageRef ? { imageRef: lib.imageRef } : {}),
    };
  });
  const have = new Set(exercises.map((e) => e.id));
  for (const e of library) {
    if (!have.has(e.id)) exercises.push({ ...e, increment: increments[e.equipment] ?? e.increment });
  }

  const programDays: ProgramDay[] = input.programDays.map((d) => {
    const { label, ...rest } = d;
    return {
      ...rest,
      programId: SEED_PROGRAM_ID,
      name: `Day ${label ?? d.id}`,
      slots: (d.slots as Row[]).map((s): SlotDef => ({
        ...(s as SlotDef),
        progressionStyle: oldType.get(s.exerciseId) === 'main' ? 'estimatedMax' : 'repsFirst',
      })),
    } as ProgramDay;
  });

  const programs: Program[] = programDays.length
    ? [{ id: SEED_PROGRAM_ID, name: SEED_PROGRAM_NAME, createdAt: now, isTemplate: true }]
    : [];

  return {
    exercises,
    programs,
    programDays,
    settings: input.settings.map((s) => ({ ...s, increments, activeProgramId: programs.length ? SEED_PROGRAM_ID : null })),
  };
}

export type { ExerciseDef };
