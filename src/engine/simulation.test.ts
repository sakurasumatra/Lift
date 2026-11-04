import { describe, expect, it } from 'vitest';
import {
  buildQueue, clampIncrements, defaultReturnPhase, effectiveLoad, finishSessionState, floorToIncrement,
  isMaxStyle, prescribe, setsForMain, suggestNextWeight, targetsFor,
} from './index';
import type { ExerciseState, LoggedSet, PrescriptionKind, SlotState } from './index';
import { allSlots, days, lib } from './testkit';

/** Deterministic PRNG so the simulation is reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The simulated lifter's true effective-load e1RM per exercise (kg), growing 0.8% per session.
const TRUE_E1RM: Record<string, number> = {
  'back-squat': 110, 'bench-press': 80, 'chest-supported-row': 90, 'lying-leg-curl': 60,
  'dumbbell-lateral-raise': 9, 'romanian-deadlift': 100, 'lat-pulldown': 80, 'leg-press': 200,
  'dumbbell-curl': 25, deadlift: 130, 'overhead-press': 50, 'pull-up': 100,
  'incline-dumbbell-press': 30, 'cable-pushdown': 40,
};
const BODYWEIGHT = 80;
const SESSIONS = 24; // 8 weeks × 3 days

interface Rx { session: number; slotId: string; weight: number; kind: PrescriptionKind; }

function simulate(prog: typeof days = days) {
  const progSlots = prog.flatMap((d) => d.slots);
  const rand = mulberry32(42);
  let exerciseStates: Record<string, ExerciseState> = {};
  let slotStates: Record<string, SlotState> = {};
  let returnPhase = defaultReturnPhase();
  const rx: Rx[] = [];
  const phaseAtSession: boolean[] = [];

  for (let t = 0; t < SESSIONS; t++) {
    const day = prog[t % 3];
    phaseAtSession.push(returnPhase.active);
    const queue = buildQueue(day.slots.map((s) => ({
      slotId: s.slotId, group: s.group, isMain: isMaxStyle(s),
      sets: isMaxStyle(s) ? setsForMain(s.sets, returnPhase) : s.sets,
    })));
    const sets: LoggedSet[] = [];
    const last = new Map<string, { set: LoggedSet; kind: PrescriptionKind }>();
    const members = () => Object.values(lib).map((exercise) => ({ exercise, state: exerciseStates[exercise.id] }));

    for (const item of queue) {
      const slot = day.slots.find((s) => s.slotId === item.slotId)!;
      const ex = lib[slot.exerciseId];
      const trueE = TRUE_E1RM[ex.id] * (1 + 0.008 * t) * (1 - 0.01 * item.setIndex);
      const { targetReps } = targetsFor(slot, returnPhase);

      let weight: number;
      let kind: PrescriptionKind;
      let prescribed: number | null;
      if (item.setIndex === 0) {
        const p = prescribe({ exercise: ex, slot, slotState: slotStates[slot.slotId], exerciseState: exerciseStates[ex.id], familyMembers: members(), bodyweight: BODYWEIGHT, returnPhase, unit: 'kg' });
        kind = p.kind;
        prescribed = p.weight;
        if (p.weight == null) {
          // calibration: the lifter picks something ~10% light of what they could do for the target
          const eff = (trueE / (1 + (targetReps + 3) / 30)) * 0.9;
          weight = floorToIncrement(ex.equipment === 'bodyweight' ? eff - BODYWEIGHT : eff, ex.increment);
        } else weight = p.weight;
        rx.push({ session: t, slotId: slot.slotId, weight, kind });
      } else {
        const prev = last.get(slot.slotId)!;
        const sug = suggestNextWeight({
          set: prev.set, kind: prev.kind, exercise: ex, repMin: slot.repMin, repMax: slot.repMax,
          targetReps, targetRIR: targetsFor(slot, returnPhase).targetRIR, bodyweight: BODYWEIGHT, unit: 'kg',
        });
        weight = sug.weight;
        kind = prev.kind === 'calibration' ? 'normal' : prev.kind;
        prescribed = weight;
      }

      const eff = effectiveLoad(ex.equipment, weight, BODYWEIGHT);
      const maxReps = 30 * (trueE / eff - 1);
      const rir = 1 + Math.floor(rand() * 3); // 1–3 in reserve
      const reps = Math.max(1, Math.min(20, Math.floor(maxReps - rir)));
      const rpe = !isMaxStyle(slot) && rand() < 0.5 ? null : 10 - rir;
      const logged: LoggedSet = { slotId: slot.slotId, exerciseId: ex.id, setIndex: item.setIndex, weight, reps, rpe, prescribedWeight: prescribed, prescriptionKind: kind };
      sets.push(logged);
      last.set(slot.slotId, { set: logged, kind });
    }

    const r = finishSessionState({ sets, allSlots: progSlots, exercises: lib, exerciseStates, slotStates, bodyweight: BODYWEIGHT, unit: 'kg', returnPhase, now: t + 1 });
    exerciseStates = { ...exerciseStates, ...r.exerciseStates };
    slotStates = { ...slotStates, ...r.slotStates };
    returnPhase = r.returnPhase;
  }
  return { rx, exerciseStates, slotStates, returnPhase, phaseAtSession };
}

describe('8-week simulation from the return phase', () => {
  const sim = simulate();
  const mainSlots = allSlots.filter((s) => isMaxStyle(s));

  it('every prescription is a finite multiple of the increment', () => {
    for (const r of sim.rx) {
      const inc = lib[allSlots.find((s) => s.slotId === r.slotId)!.exerciseId].increment;
      expect(Number.isFinite(r.weight)).toBe(true);
      expect(Math.abs(r.weight / inc - Math.round(r.weight / inc))).toBeLessThan(1e-6);
    }
  });

  it('the return phase runs 12 sessions and then switches off', () => {
    expect(sim.phaseAtSession.slice(0, 12).every(Boolean)).toBe(true);
    expect(sim.phaseAtSession.slice(12).every((a) => !a)).toBe(true);
    expect(sim.returnPhase).toEqual({ active: false, sessionsCompleted: 12 });
  });

  it('non-exempt main-lift changes never exceed the per-slot clamp', () => {
    let checked = 0;
    for (const slot of mainSlots) {
      const list = sim.rx.filter((r) => r.slotId === slot.slotId);
      const n = clampIncrements(lib[slot.exerciseId].family);
      const inc = lib[slot.exerciseId].increment;
      for (let i = 1; i < list.length; i++) {
        const [a, b] = [list[i - 1], list[i]];
        const exempt = ['calibration', 'predicted', 'deload'].includes(b.kind) || ['calibration', 'predicted'].includes(a.kind);
        if (exempt) continue;
        checked++;
        expect(Math.abs(b.weight - a.weight), `${slot.slotId} session ${b.session}`).toBeLessThanOrEqual(n * inc + 1e-9);
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('main-lift weights trend upward over 8 weeks', () => {
    for (const slot of mainSlots) {
      const list = sim.rx.filter((r) => r.slotId === slot.slotId);
      const first = list.find((r) => r.kind === 'normal') ?? list[0];
      const lastRx = list[list.length - 1];
      expect(lastRx.weight, slot.slotId).toBeGreaterThan(first.weight);
    }
  });

  it('bench press’s two slots keep different weights from one e1RM', () => {
    const a2 = sim.rx.filter((r) => r.slotId === 'A2').pop()!;
    const b1 = sim.rx.filter((r) => r.slotId === 'B1').pop()!;
    expect(b1.weight).toBeGreaterThan(a2.weight);
  });

  it('e1RM ends near the lifter’s true strength', () => {
    for (const id of ['back-squat', 'bench-press', 'deadlift', 'overhead-press']) {
      const truth = TRUE_E1RM[id] * (1 + 0.008 * (SESSIONS - 1));
      expect(sim.exerciseStates[id].e1rm / truth).toBeGreaterThan(0.85);
      expect(sim.exerciseStates[id].e1rm / truth).toBeLessThan(1.1);
    }
  });
});

export { simulate };

describe('8-week simulation with a user-built mix of progression styles', () => {
  // Lat pulldown (B3) becomes an estimated-max slot; the 6–8 bench slot (A2) becomes reps-first.
  const flipped = days.map((d) => ({
    ...d,
    slots: d.slots.map((s) => (s.slotId === 'B3' ? { ...s, progressionStyle: 'estimatedMax' as const }
      : s.slotId === 'A2' ? { ...s, progressionStyle: 'repsFirst' as const } : s)),
  }));
  const sim = simulate(flipped);

  it('the flipped estimated-max slot follows the e1RM model: clamped to ±1 increment and trending up', () => {
    const list = sim.rx.filter((r) => r.slotId === 'B3');
    const inc = lib['lat-pulldown'].increment;
    let checked = 0;
    for (let i = 1; i < list.length; i++) {
      const [a, b] = [list[i - 1], list[i]];
      if (['calibration', 'predicted', 'deload'].includes(b.kind) || ['calibration', 'predicted'].includes(a.kind)) continue;
      checked++;
      expect(Math.abs(b.weight - a.weight), `B3 session ${b.session}`).toBeLessThanOrEqual(clampIncrements(lib['lat-pulldown'].family) * inc + 1e-9);
    }
    expect(checked).toBeGreaterThan(3);
    expect(list[list.length - 1].weight).toBeGreaterThan(list[0].weight);
  });

  it('the flipped reps-first slot moves by whole increments only (double progression), never a clamp-sized jump', () => {
    const list = sim.rx.filter((r) => r.slotId === 'A2' && r.kind === 'normal');
    const inc = lib['bench-press'].increment;
    for (let i = 1; i < list.length; i++) expect(Math.abs(list[i].weight - list[i - 1].weight), `A2 session ${list[i].session}`).toBeLessThanOrEqual(inc + 1e-9);
  });

  it('bench press still has one e1RM, fed by both slots, and ends near the lifter’s true strength', () => {
    const truth = TRUE_E1RM['bench-press'] * (1 + 0.008 * (SESSIONS - 1));
    expect(sim.exerciseStates['bench-press'].e1rm / truth).toBeGreaterThan(0.85);
    expect(sim.exerciseStates['bench-press'].e1rm / truth).toBeLessThan(1.1);
  });

  it('every prescription is still a finite multiple of the increment', () => {
    for (const r of sim.rx) {
      const inc = lib[flipped.flatMap((d) => d.slots).find((s) => s.slotId === r.slotId)!.exerciseId].increment;
      expect(Number.isFinite(r.weight)).toBe(true);
      expect(Math.abs(r.weight / inc - Math.round(r.weight / inc))).toBeLessThan(1e-6);
    }
  });
});
