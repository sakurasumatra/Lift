import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../db/service';
import { defaultSettings } from '../db/db';
import { allSlots, days, exState, lib, set, slotById, slotState } from '../engine/testkit';
import { setDefaults } from './prescriptions';

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  settings: { ...defaultSettings(), bodyweight: 80, returnPhase: { active: false, sessionsCompleted: 0 } },
  exercises: lib,
  programs: [],
  activeProgram: null,
  days,
  activeDays: days,
  exerciseStates: {},
  slotStates: {},
  ...over,
});

describe('workout set defaults', () => {
  it('a calibration set prefills the bar but records no prescribed weight', () => {
    const d = setDefaults(snap(), slotById('A1'), 'back-squat', 0, undefined);
    expect(d).toMatchObject({ weight: 20, prescribedWeight: null, kind: 'calibration' });
  });
  it('set 1 uses the slot prescription', () => {
    const d = setDefaults(snap({ slotStates: { A2: slotState('A2', 80, { nextWeight: 82.5 }) } }), slotById('A2'), 'bench-press', 0, undefined);
    expect(d).toMatchObject({ weight: 82.5, prescribedWeight: 82.5, kind: 'normal' });
  });
  it('later sets (and so the next-up strip) use the in-session suggestion', () => {
    const s = snap({ exerciseStates: { 'chest-supported-row': exState('chest-supported-row', 80) }, slotStates: { A3: slotState('A3', 50) } });
    const prev = set('A3', 0, 50, 12, null, { prescriptionKind: 'normal' }); // hit repMax → +1 increment
    expect(setDefaults(s, slotById('A3'), 'chest-supported-row', 1, prev)).toMatchObject({ weight: 52.5, prescribedWeight: 52.5 });
  });
  it('after a calibration set the next set is normal and recalibrated', () => {
    const prev = set('A1', 0, 60, 10, 8, { prescriptionKind: 'calibration' });
    const d = setDefaults(snap(), slotById('A1'), 'back-squat', 1, prev);
    expect(d.kind).toBe('normal');
    expect(d.weight).toBe(67.5); // 60 × (1 + 12/30) = 84 → / (1 + 7/30) = 68.1 → rounds down to 67.5
  });
  it('covers every program slot without throwing', () => {
    for (const slot of allSlots) expect(() => setDefaults(snap(), slot, slot.exerciseId, 0, undefined)).not.toThrow();
  });
});
