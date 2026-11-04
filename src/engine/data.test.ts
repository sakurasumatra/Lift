import { describe, expect, it } from 'vitest';
import { buildExerciseLibrary, buildSeedProgram } from '../data/library';
import { CUES } from '../data/cues';

describe('seed data integrity', () => {
  const lib = buildExerciseLibrary('kg');
  const byId = new Map(lib.map((e) => [e.id, e]));
  const program = buildSeedProgram();

  it('every program exercise exists in the library and belongs to a family', () => {
    for (const day of program) for (const s of day.slots) {
      const ex = byId.get(s.exerciseId);
      expect(ex, s.exerciseId).toBeDefined();
      expect(ex!.family).toBeTruthy();
    }
  });
  it('every family has exactly one anchor with ratio 1', () => {
    const fams = new Map<string, number[]>();
    for (const e of lib) fams.set(e.family, [...(fams.get(e.family) ?? []), e.familyRatio]);
    expect(fams.size).toBe(11);
    for (const [, ratios] of fams) expect(ratios.filter((r) => r === 1).length).toBeGreaterThanOrEqual(1);
  });
  it('matches the program table: 3 days, A/B/C, slot counts', () => {
    expect(program.map((d) => [d.label, d.slots.length])).toEqual([['A', 5], ['B', 5], ['C', 5]]);
    expect(program[0].slots[0]).toMatchObject({ exerciseId: 'back-squat', sets: 4, repMin: 4, repMax: 6, group: 1 });
    expect(program[1].slots[0]).toMatchObject({ exerciseId: 'bench-press', sets: 4, repMin: 4, repMax: 6 });
    expect(program[0].slots[1]).toMatchObject({ exerciseId: 'bench-press', sets: 3, repMin: 6, repMax: 8 });
  });
  it('slot ids are unique', () => {
    const ids = program.flatMap((d) => d.slots.map((s) => s.slotId));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('increments follow equipment (dumbbell 2 kg, others 2.5)', () => {
    expect(byId.get('dumbbell-curl')!.increment).toBe(2);
    expect(byId.get('back-squat')!.increment).toBe(2.5);
    expect(buildExerciseLibrary('lb').find((e) => e.id === 'dumbbell-curl')!.increment).toBe(5);
  });
  it('every exercise has 3–4 form cues', () => {
    for (const e of lib) {
      expect(CUES[e.id]?.length, e.id).toBeGreaterThanOrEqual(3);
      expect(CUES[e.id].length).toBeLessThanOrEqual(4);
    }
  });
});
