import { describe, expect, it } from 'vitest';
import { CUES } from '../data/cues';
import imageSources from '../data/imageSources.json';
import { buildExerciseLibrary, instantiateTemplate, buildSeedProgram } from '../data/library';
import { EQUIPMENT_LIST, MUSCLE_LIST, filterExercises, type Equipment } from './index';

const lib = buildExerciseLibrary('kg');
const imageFiles = new Set(Object.keys(import.meta.glob('../../public/exercises/*.jpg')).map((p) => p.split('/').pop()!.replace('.jpg', '')));
const byId = new Map(lib.map((e) => [e.id, e]));

describe('bundled exercise library', () => {
  it('has 150+ exercises with unique ids and names', () => {
    expect(lib.length).toBeGreaterThanOrEqual(150);
    expect(new Set(lib.map((e) => e.id)).size).toBe(lib.length);
    expect(new Set(lib.map((e) => e.name.toLowerCase())).size).toBe(lib.length);
  });

  it('covers barbell, dumbbell, machine, cable, bodyweight, kettlebell and band', () => {
    for (const q of EQUIPMENT_LIST) expect(lib.filter((e) => e.equipment === q).length, q).toBeGreaterThanOrEqual(8);
  });

  it('every exercise has an equipment, a muscle group and a default progression style', () => {
    for (const e of lib) {
      expect(EQUIPMENT_LIST, e.id).toContain(e.equipment);
      expect(MUSCLE_LIST, e.id).toContain(e.primaryMuscle);
      expect(['estimatedMax', 'repsFirst'], e.id).toContain(e.defaultProgressionStyle);
      expect(e.increment, e.id).toBeGreaterThan(0);
    }
  });

  it('a family always comes with a ratio, and ratios are positive', () => {
    for (const e of lib) {
      if (e.family) expect(e.familyRatio, e.id).toBeGreaterThan(0);
      else expect(e.familyRatio, e.id).toBeUndefined();
    }
  });

  it('barbell compound lifts default to Estimated max and the isolation work to Reps first', () => {
    for (const id of ['back-squat', 'bench-press', 'deadlift', 'overhead-press', 'romanian-deadlift', 'front-squat', 'bent-over-barbell-row', 'hip-thrust']) {
      expect(byId.get(id)!.defaultProgressionStyle, id).toBe('estimatedMax');
    }
    for (const id of ['barbell-curl', 'lat-pulldown', 'leg-press', 'dumbbell-curl', 'cable-pushdown', 'pull-up', 'barbell-shrug', 'kettlebell-swing']) {
      expect(byId.get(id)!.defaultProgressionStyle, id).toBe('repsFirst');
    }
  });

  it('keeps every template exercise under its exact name with its family', () => {
    const names = ['Back squat', 'Bench press', 'Chest-supported row', 'Lying leg curl', 'Dumbbell lateral raise', 'Romanian deadlift', 'Lat pulldown', 'Leg press', 'Dumbbell curl', 'Deadlift', 'Overhead press', 'Pull-up', 'Incline dumbbell press', 'Cable pushdown'];
    for (const n of names) {
      const e = lib.find((x) => x.name === n);
      expect(e, n).toBeDefined();
      expect(e!.family, n).toBeTruthy();
    }
  });

  it('every exercise has 3–4 original form cues', () => {
    for (const e of lib) {
      expect(CUES[e.id]?.length, e.id).toBeGreaterThanOrEqual(3);
      expect(CUES[e.id].length, e.id).toBeLessThanOrEqual(4);
    }
  });

  it('every mapped image exists on disk and is only used for a real exercise', () => {
    for (const [id, ref] of Object.entries(imageSources as Record<string, string>)) {
      expect(byId.has(id), id).toBe(true);
      expect(typeof ref).toBe('string');
      expect(imageFiles.has(id), id).toBe(true);
    }
    expect(Object.keys(imageSources).length).toBeGreaterThan(150);
    for (const e of lib) expect(!!e.imageRef, e.id).toBe(e.id in (imageSources as Record<string, string>));
  });

  it('lb libraries use lb increments, kettlebells and bands included', () => {
    const l = buildExerciseLibrary('lb');
    expect(l.find((e) => e.id === 'kettlebell-swing')!.increment).toBe(10);
    expect(l.find((e) => e.id === 'bench-press')!.increment).toBe(5);
  });
});

describe('template copies', () => {
  it('instantiateTemplate gives every day and slot a fresh id, and keeps styles', () => {
    let n = 0;
    const copy = instantiateTemplate('prog', () => `id-${n++}`);
    expect(copy).toHaveLength(3);
    expect(copy.every((d) => d.programId === 'prog')).toBe(true);
    const ids = copy.flatMap((d) => [d.id, ...d.slots.map((s) => s.slotId)]);
    expect(new Set(ids).size).toBe(18);
    expect(ids.some((i) => /^[ABC]\d?$/.test(i))).toBe(false);
    const orig = buildSeedProgram();
    expect(copy.map((d) => d.slots.map((s) => s.progressionStyle))).toEqual(orig.map((d) => d.slots.map((s) => s.progressionStyle)));
  });
});

describe('library search and filters', () => {
  it('matches every word of the query in any order, ignoring case', () => {
    const names = (text: string) => filterExercises(lib, { text, muscle: '', equipment: '' }).map((e) => e.name);
    expect(names('PRESS bench')).toContain('Bench press');
    expect(names('bench press')).toContain('Incline bench press');
    expect(names('zzzz')).toEqual([]);
    expect(names('').length).toBe(lib.length);
  });
  it('filters by muscle and equipment, sorts by name, and hides hidden exercises unless asked', () => {
    const hidden = lib.map((e) => (e.id === 'bench-press' ? { ...e, hidden: true } : e));
    const chest = filterExercises(hidden, { text: '', muscle: 'chest', equipment: 'barbell' });
    expect(chest.every((e) => e.primaryMuscle === 'chest' && e.equipment === 'barbell')).toBe(true);
    expect(chest.map((e) => e.name)).not.toContain('Bench press');
    expect(filterExercises(hidden, { text: '', muscle: 'chest', equipment: 'barbell', showHidden: true }).map((e) => e.name)).toContain('Bench press');
    const sorted = chest.map((e) => e.name);
    expect(sorted).toEqual([...sorted].sort((a, b) => a.localeCompare(b)));
    const bands = filterExercises(lib, { text: '', muscle: '', equipment: 'band' as Equipment });
    expect(bands.length).toBeGreaterThan(5);
  });
});
