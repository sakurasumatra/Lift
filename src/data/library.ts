import type { Equipment, ExerciseDef, FamilyId, MuscleGroup, Program, ProgramDay, ProgressionStyle, SlotDef, Unit } from '../engine';
import { DEFAULT_INCREMENTS } from '../engine';
import imageSources from './imageSources.json';
import { EXTRA_EXERCISES } from './extraExercises';

type Row = [name: string, family: FamilyId, ratio: number, equipment: Equipment, style: ProgressionStyle, muscle: MuscleGroup];
const MAX = 'estimatedMax', REPS = 'repsFirst';

/** The exercises of the built-in 3-day template, with their movement families. Dumbbell ratios are per dumbbell. */
const CORE: Row[] = [
  // Horizontal press
  ['Bench press', 'horizontal-press', 1.0, 'barbell', MAX, 'chest'],
  ['Dumbbell bench press', 'horizontal-press', 0.4, 'dumbbell', REPS, 'chest'],
  ['Incline dumbbell press', 'horizontal-press', 0.35, 'dumbbell', REPS, 'chest'],
  ['Machine chest press', 'horizontal-press', 0.9, 'machine', REPS, 'chest'],
  // Squat
  ['Back squat', 'squat', 1.0, 'barbell', MAX, 'quads'],
  ['Front squat', 'squat', 0.8, 'barbell', MAX, 'quads'],
  ['Hack squat', 'squat', 1.1, 'machine', REPS, 'quads'],
  ['Goblet squat', 'squat', 0.35, 'dumbbell', REPS, 'quads'],
  ['Leg press', 'squat', 1.8, 'machine', REPS, 'quads'], // low confidence; machines vary
  // Hinge
  ['Deadlift', 'hinge', 1.0, 'barbell', MAX, 'back'],
  ['Trap-bar deadlift', 'hinge', 1.05, 'barbell', MAX, 'back'],
  ['Romanian deadlift', 'hinge', 0.75, 'barbell', MAX, 'hamstrings'],
  ['Dumbbell RDL', 'hinge', 0.3, 'dumbbell', REPS, 'hamstrings'],
  // Vertical press
  ['Overhead press', 'vertical-press', 1.0, 'barbell', MAX, 'shoulders'],
  ['Seated dumbbell press', 'vertical-press', 0.38, 'dumbbell', REPS, 'shoulders'],
  ['Machine shoulder press', 'vertical-press', 0.9, 'machine', REPS, 'shoulders'],
  // Row
  ['Chest-supported row', 'row', 1.0, 'machine', REPS, 'back'],
  ['Seated cable row', 'row', 1.0, 'cable', REPS, 'back'],
  ['Dumbbell row', 'row', 0.45, 'dumbbell', REPS, 'back'],
  // Vertical pull (cable/machine)
  ['Lat pulldown', 'vertical-pull', 1.0, 'cable', REPS, 'back'],
  ['Machine pulldown', 'vertical-pull', 1.0, 'machine', REPS, 'back'],
  // Pull-up (effective load; no transfer to or from pulldowns)
  ['Pull-up', 'pull-up', 1.0, 'bodyweight', REPS, 'back'],
  ['Chin-up', 'pull-up', 1.05, 'bodyweight', REPS, 'back'],
  // Leg curl
  ['Lying leg curl', 'leg-curl', 1.0, 'machine', REPS, 'hamstrings'],
  ['Seated leg curl', 'leg-curl', 1.0, 'machine', REPS, 'hamstrings'],
  // Lateral raise
  ['Dumbbell lateral raise', 'lateral-raise', 1.0, 'dumbbell', REPS, 'shoulders'],
  ['Cable lateral raise', 'lateral-raise', 0.6, 'cable', REPS, 'shoulders'],
  // Curl
  ['Dumbbell curl', 'curl', 1.0, 'dumbbell', REPS, 'biceps'],
  ['Barbell curl', 'curl', 2.2, 'barbell', REPS, 'biceps'],
  ['Cable curl', 'curl', 2.0, 'cable', REPS, 'biceps'],
  // Triceps
  ['Cable pushdown', 'triceps', 1.0, 'cable', REPS, 'triceps'],
  ['Overhead cable extension', 'triceps', 0.85, 'cable', REPS, 'triceps'],
];

export const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const images = imageSources as Record<string, string>;

/** The full bundled library: the template exercises plus the broader Free Exercise DB selection. */
export function buildExerciseLibrary(unit: Unit = 'kg'): ExerciseDef[] {
  const make = (name: string, equipment: Equipment, primaryMuscle: MuscleGroup, defaultProgressionStyle: ProgressionStyle, family?: FamilyId, familyRatio?: number): ExerciseDef => {
    const id = slug(name);
    return {
      id, name, equipment, primaryMuscle, defaultProgressionStyle,
      increment: DEFAULT_INCREMENTS[unit][equipment],
      ...(family ? { family, familyRatio } : {}),
      isCustom: false,
      hidden: false,
      ...(images[id] ? { imageRef: images[id] } : {}),
    };
  };
  return [
    ...CORE.map(([name, family, ratio, equipment, style, muscle]) => make(name, equipment, muscle, style, family, ratio)),
    ...EXTRA_EXERCISES.map(([name, equipment, muscle, family, ratio, style]) => make(name, equipment, muscle, style, family, ratio)),
  ];
}

export const exerciseId = slug;

export const SEED_PROGRAM_ID = 'p-mine';
export const SEED_PROGRAM_NAME = '3-day template (mine)';

type SlotRow = [name: string, group: number, sets: number, repMin: number, repMax: number, style: ProgressionStyle];

/** The 3-day full-body template. Day names are "Day A", "Day B", "Day C". */
const PROGRAM: Record<string, SlotRow[]> = {
  A: [
    ['Back squat', 1, 4, 4, 6, MAX],
    ['Bench press', 2, 3, 6, 8, MAX],
    ['Chest-supported row', 2, 3, 8, 12, REPS],
    ['Lying leg curl', 3, 3, 10, 15, REPS],
    ['Dumbbell lateral raise', 3, 3, 12, 15, REPS],
  ],
  B: [
    ['Bench press', 1, 4, 4, 6, MAX],
    ['Romanian deadlift', 2, 3, 6, 8, MAX],
    ['Lat pulldown', 2, 3, 8, 12, REPS],
    ['Leg press', 3, 3, 10, 12, REPS],
    ['Dumbbell curl', 3, 3, 10, 15, REPS],
  ],
  C: [
    ['Deadlift', 1, 3, 3, 5, MAX],
    ['Overhead press', 2, 3, 6, 8, MAX],
    ['Pull-up', 2, 3, 6, 10, REPS], // "assisted ok": negative added load = assistance
    ['Incline dumbbell press', 3, 3, 8, 12, REPS],
    ['Cable pushdown', 4, 3, 10, 15, REPS],
  ],
};

/** The template as saved days with the original ids (A/B/C, slots A1…): used to seed a fresh install. */
export function buildSeedProgram(programId = SEED_PROGRAM_ID): ProgramDay[] {
  return Object.entries(PROGRAM).map(([label, rows], order) => ({
    id: label,
    programId,
    name: `Day ${label}`,
    order,
    slots: rows.map(([name, group, sets, repMin, repMax, progressionStyle], i): SlotDef => ({
      slotId: `${label}${i + 1}`,
      exerciseId: slug(name),
      progressionStyle,
      group,
      sets,
      repMin,
      repMax,
    })),
  }));
}

/** A fresh copy of the template for a new program: every day and slot gets a new id, so edits never touch the original. */
export function instantiateTemplate(programId: string, newId: () => string): ProgramDay[] {
  return buildSeedProgram(programId).map((d) => ({
    ...d,
    id: newId(),
    slots: d.slots.map((s) => ({ ...s, slotId: newId() })),
  }));
}

export const seedProgramRow = (now = Date.now()): Program => ({ id: SEED_PROGRAM_ID, name: SEED_PROGRAM_NAME, createdAt: now, isTemplate: true });
