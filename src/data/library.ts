import type { Equipment, ExerciseDef, ExerciseType, FamilyId, SlotDef, Unit } from '../engine';
import { DEFAULT_INCREMENTS } from '../engine';

type Row = [name: string, family: FamilyId, ratio: number, equipment: Equipment, type: ExerciseType];

/** Ratios are starting guesses (editable in Settings); dumbbell ratios are per dumbbell. */
const ROWS: Row[] = [
  // Horizontal press
  ['Bench press', 'horizontal-press', 1.0, 'barbell', 'main'],
  ['Dumbbell bench press', 'horizontal-press', 0.4, 'dumbbell', 'accessory'],
  ['Incline dumbbell press', 'horizontal-press', 0.35, 'dumbbell', 'accessory'],
  ['Machine chest press', 'horizontal-press', 0.9, 'machine', 'accessory'],
  // Squat
  ['Back squat', 'squat', 1.0, 'barbell', 'main'],
  ['Front squat', 'squat', 0.8, 'barbell', 'main'],
  ['Hack squat', 'squat', 1.1, 'machine', 'accessory'],
  ['Goblet squat', 'squat', 0.35, 'dumbbell', 'accessory'],
  ['Leg press', 'squat', 1.8, 'machine', 'accessory'], // low confidence; machines vary
  // Hinge
  ['Deadlift', 'hinge', 1.0, 'barbell', 'main'],
  ['Trap-bar deadlift', 'hinge', 1.05, 'barbell', 'main'],
  ['Romanian deadlift', 'hinge', 0.75, 'barbell', 'main'],
  ['Dumbbell RDL', 'hinge', 0.3, 'dumbbell', 'accessory'],
  // Vertical press
  ['Overhead press', 'vertical-press', 1.0, 'barbell', 'main'],
  ['Seated dumbbell press', 'vertical-press', 0.38, 'dumbbell', 'accessory'],
  ['Machine shoulder press', 'vertical-press', 0.9, 'machine', 'accessory'],
  // Row
  ['Chest-supported row', 'row', 1.0, 'machine', 'accessory'],
  ['Seated cable row', 'row', 1.0, 'cable', 'accessory'],
  ['Dumbbell row', 'row', 0.45, 'dumbbell', 'accessory'],
  // Vertical pull (cable/machine)
  ['Lat pulldown', 'vertical-pull', 1.0, 'cable', 'accessory'],
  ['Machine pulldown', 'vertical-pull', 1.0, 'machine', 'accessory'],
  // Pull-up (effective load; no transfer to or from pulldowns)
  ['Pull-up', 'pull-up', 1.0, 'bodyweight', 'accessory'],
  ['Chin-up', 'pull-up', 1.05, 'bodyweight', 'accessory'],
  // Leg curl
  ['Lying leg curl', 'leg-curl', 1.0, 'machine', 'accessory'],
  ['Seated leg curl', 'leg-curl', 1.0, 'machine', 'accessory'],
  // Lateral raise
  ['Dumbbell lateral raise', 'lateral-raise', 1.0, 'dumbbell', 'accessory'],
  ['Cable lateral raise', 'lateral-raise', 0.6, 'cable', 'accessory'],
  // Curl
  ['Dumbbell curl', 'curl', 1.0, 'dumbbell', 'accessory'],
  ['Barbell curl', 'curl', 2.2, 'barbell', 'accessory'],
  ['Cable curl', 'curl', 2.0, 'cable', 'accessory'],
  // Triceps
  ['Cable pushdown', 'triceps', 1.0, 'cable', 'accessory'],
  ['Overhead cable extension', 'triceps', 0.85, 'cable', 'accessory'],
];

export const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function buildExerciseLibrary(unit: Unit = 'kg'): ExerciseDef[] {
  return ROWS.map(([name, family, familyRatio, equipment, type]) => ({
    id: slug(name),
    name,
    type,
    equipment,
    increment: DEFAULT_INCREMENTS[unit][equipment],
    family,
    familyRatio,
  }));
}

export const exerciseId = slug;

export interface ProgramDay {
  id: string;
  label: string;
  order: number;
  slots: SlotDef[];
}

type SlotRow = [name: string, group: number, sets: number, repMin: number, repMax: number];

const PROGRAM: Record<string, SlotRow[]> = {
  A: [
    ['Back squat', 1, 4, 4, 6],
    ['Bench press', 2, 3, 6, 8],
    ['Chest-supported row', 2, 3, 8, 12],
    ['Lying leg curl', 3, 3, 10, 15],
    ['Dumbbell lateral raise', 3, 3, 12, 15],
  ],
  B: [
    ['Bench press', 1, 4, 4, 6],
    ['Romanian deadlift', 2, 3, 6, 8],
    ['Lat pulldown', 2, 3, 8, 12],
    ['Leg press', 3, 3, 10, 12],
    ['Dumbbell curl', 3, 3, 10, 15],
  ],
  C: [
    ['Deadlift', 1, 3, 3, 5],
    ['Overhead press', 2, 3, 6, 8],
    ['Pull-up', 2, 3, 6, 10], // "assisted ok": negative added load = assistance
    ['Incline dumbbell press', 3, 3, 8, 12],
    ['Cable pushdown', 4, 3, 10, 15],
  ],
};

export function buildSeedProgram(): ProgramDay[] {
  return Object.entries(PROGRAM).map(([label, rows], order) => ({
    id: label,
    label,
    order,
    slots: rows.map(([name, group, sets, repMin, repMax], i) => ({
      slotId: `${label}${i + 1}`,
      exerciseId: slug(name),
      group,
      sets,
      repMin,
      repMax,
    })),
  }));
}
