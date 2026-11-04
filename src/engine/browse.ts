import type { Equipment, ExerciseDef, MuscleGroup } from './types';

/** Case-insensitive name search plus muscle and equipment filters. Pure, so it's easy to test. */
export function filterExercises(
  all: ExerciseDef[],
  q: { text: string; muscle: MuscleGroup | ''; equipment: Equipment | ''; showHidden?: boolean },
): ExerciseDef[] {
  const words = q.text.toLowerCase().split(/\s+/).filter(Boolean);
  return all
    .filter((e) => (q.showHidden ? true : !e.hidden))
    .filter((e) => !q.muscle || e.primaryMuscle === q.muscle)
    .filter((e) => !q.equipment || e.equipment === q.equipment)
    .filter((e) => words.every((w) => e.name.toLowerCase().includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name));
}
