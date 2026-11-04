import { effectiveLoad, isMiss, sessionE1rm, smoothE1rm } from './e1rm';
import { clampIncrements, clampWeight, prescribe, targetsFor, weightFromE1rm } from './prescribe';
import { advanceReturnPhase } from './returnPhase';
import type {
  ExerciseDef,
  ExerciseState,
  LoggedSet,
  PrescriptionKind,
  ReturnPhase,
  SlotDef,
  SlotState,
  StrongerCard,
  SummaryItem,
  Unit,
} from './types';
import { floorToIncrement, formatNumber, formatSigned, minLoad } from './units';

export const DELOAD_FACTOR = 0.9;

/** 90% of the last working weight, rounded down (computed on effective load for bodyweight lifts). */
export function deloadWeight(lastWorking: number, exercise: ExerciseDef, bodyweight: number, unit?: Unit): number {
  const eff = effectiveLoad(exercise.equipment, lastWorking, bodyweight) * DELOAD_FACTOR;
  const logged = exercise.equipment === 'bodyweight' ? eff - bodyweight : eff;
  const w = floorToIncrement(logged, exercise.increment);
  return unit ? Math.max(w, minLoad(exercise.equipment, unit)) : w;
}

export interface NextMainInput {
  exercise: ExerciseDef;
  slot: SlotDef;
  e1rm: number;
  /** Weight prescribed for this slot's last trained session. */
  baseline?: number;
  baselineKind?: PrescriptionKind;
  returnPhase: ReturnPhase;
  bodyweight: number;
  unit: Unit;
}

/** Normal main-lift prescription from the (already updated) smoothed e1RM, clamped per slot. */
export function nextMainPrescription(input: NextMainInput): { weight: number; reason: string } {
  const { exercise, slot, e1rm, baseline, baselineKind, returnPhase, bodyweight, unit } = input;
  const { targetReps, targetRIR } = targetsFor(slot, returnPhase);
  const candidate = weightFromE1rm(e1rm, targetReps, targetRIR, exercise, bodyweight, unit);
  const n = clampIncrements(exercise.family);
  // A calibration/predicted baseline was a guess, not a trusted prior prescription: don't clamp to it.
  const trusted = baseline != null && baselineKind !== 'calibration' && baselineKind !== 'predicted';
  const c = trusted
    ? clampWeight(candidate, baseline!, exercise.increment, n)
    : { weight: candidate, clamped: false };
  // The clamp can step below the empty bar from a bar-weight baseline: the floor wins.
  const weight = Math.max(c.weight, minLoad(exercise.equipment, unit));
  const clamped = c.clamped && weight === c.weight;

  const basis = `e1RM ${formatNumber(e1rm, 1)} ${unit} → ${targetReps} reps, ${targetRIR} in reserve`;
  const limit = clamped ? ` (limited to ±${n} increment${n > 1 ? 's' : ''} per session)` : '';
  let head: string;
  if (!trusted) head = `${formatNumber(weight)} ${unit}`;
  else if (weight > baseline!) head = formatSigned(weight - baseline!, unit);
  else if (weight < baseline!) head = formatSigned(weight - baseline!, unit);
  else head = 'Same weight';
  return { weight, reason: `${head}: ${basis}${limit}` };
}

export interface NextAccessoryInput {
  /** Sets of this slot from the session just finished. */
  sets: { weight: number; reps: number }[];
  repMin: number;
  repMax: number;
  increment: number;
  failCountBefore: number;
  unit: Unit;
  /** Lightest weight allowed (see minLoad); a −1 increment never goes below it. */
  minWeight?: number;
}

/** Double progression: all sets at repMax → +1 increment; below repMin two sessions running → −1. */
export function nextAccessoryPrescription(input: NextAccessoryInput): {
  weight: number;
  reason: string;
  failCount: number;
} {
  const { sets, repMin, repMax, increment, failCountBefore, unit, minWeight = -Infinity } = input;
  const base = sets[sets.length - 1].weight;
  if (sets.every((s) => s.reps >= repMax)) {
    return {
      weight: base + increment,
      failCount: 0,
      reason: `${formatSigned(increment, unit)}: all sets reached ${repMax} reps`,
    };
  }
  if (sets.some((s) => s.reps < repMin)) {
    const failCount = failCountBefore + 1;
    if (failCount >= 2 && base - increment >= minWeight) {
      return {
        weight: base - increment,
        failCount: 0,
        reason: `${formatSigned(-increment, unit)}: a set fell below ${repMin} reps two sessions in a row`,
      };
    }
    if (failCount >= 2) {
      return { weight: base, failCount: 0, reason: `Same weight: already the lightest it can go (${formatNumber(base)} ${unit})` };
    }
    return {
      weight: base,
      failCount,
      reason: `Same weight: a set fell below ${repMin} reps — if it happens again next time the weight drops`,
    };
  }
  return { weight: base, failCount: 0, reason: `Same weight: add reps until every set reaches ${repMax}` };
}

export interface FinishInput {
  /** Sets from the session, in chronological order. */
  sets: LoggedSet[];
  /** Every slot in the whole program (deloads reach slots that weren't trained today). */
  allSlots: SlotDef[];
  exercises: Record<string, ExerciseDef>;
  exerciseStates: Record<string, ExerciseState>;
  slotStates: Record<string, SlotState>;
  bodyweight: number;
  unit: Unit;
  returnPhase: ReturnPhase;
  now: number;
}

export interface FinishResult {
  exerciseStates: Record<string, ExerciseState>;
  slotStates: Record<string, SlotState>;
  returnPhase: ReturnPhase;
  summary: SummaryItem[];
  stronger: StrongerCard[];
  deloaded: string[];
}

export function finishSessionState(input: FinishInput): FinishResult {
  const { sets, allSlots, exercises, bodyweight, unit, returnPhase, now } = input;
  const rpActive = returnPhase.active;
  const rpAfter = sets.length > 0 ? advanceReturnPhase(returnPhase) : returnPhase;

  const newExStates: Record<string, ExerciseState> = {};
  const newSlotStates: Record<string, SlotState> = {};
  const stronger: StrongerCard[] = [];
  const deloaded: string[] = [];
  const deloadFlags = new Set<string>();

  const setsByExercise = new Map<string, LoggedSet[]>();
  for (const s of sets) {
    if (!setsByExercise.has(s.exerciseId)) setsByExercise.set(s.exerciseId, []);
    setsByExercise.get(s.exerciseId)!.push(s);
  }

  // An exercise is tracked as an "estimated max" lift today when any slot it was trained in uses that style.
  const maxTracked = new Set<string>();
  for (const s of sets) {
    const sl = allSlots.find((x) => x.slotId === s.slotId);
    if (sl && sl.progressionStyle === 'estimatedMax') maxTracked.add(s.exerciseId);
  }

  // 1. Exercise-level state: e1RM smoothing, miss detection (against the PRE-update value).
  for (const [exId, exSets] of setsByExercise) {
    const ex = exercises[exId];
    if (!ex) continue;
    const session = sessionE1rm(ex.equipment, exSets, bodyweight);
    if (session == null) continue;
    const prev = input.exerciseStates[exId];
    const isFirst = !prev || prev.sessionCount === 0;

    let missCount = prev?.missCount ?? 0;
    // A deload session is light on purpose: it always lands below trend, so it never counts as a miss.
    const deloadSession = exSets.some((s) => s.prescriptionKind === 'deload');
    if (rpActive) {
      missCount = 0; // misses and deloads are disabled in the return phase
    } else if (maxTracked.has(exId) && !isFirst && !deloadSession) {
      if (isMiss(session, prev!.e1rm)) {
        missCount += 1;
        if (missCount >= 2) {
          deloadFlags.add(exId);
          deloaded.push(exId);
          missCount = 0;
        }
      } else {
        missCount = 0;
      }
    }

    const e1rm = isFirst ? session : smoothE1rm(prev!.e1rm, session, rpActive);
    if (!isFirst && e1rm - prev!.e1rm + 1e-9 >= ex.increment) {
      stronger.push({ exerciseId: exId, oldE1rm: prev!.e1rm, newE1rm: e1rm, delta: e1rm - prev!.e1rm });
    }

    newExStates[exId] = {
      exerciseId: exId,
      e1rm,
      missCount,
      accessoryFailCount: prev?.accessoryFailCount ?? 0,
      predictedFrom: undefined,
      updatedAt: now,
      sessionCount: (prev?.sessionCount ?? 0) + 1,
      lastWeight: exSets[exSets.length - 1].weight,
      calibrateFirst: false,
    };
  }

  /**
   * Double progression for an accessory's sets in one slot. The result is also kept on the exercise
   * state, so the next time it's used without slot state of its own (a swap) it carries on from here.
   */
  const progressAccessory = (ex: ExerciseDef, slot: SlotDef, trained: LoggedSet[]) => {
    const prevState = input.exerciseStates[ex.id];
    // Only zero-rep sets: no session e1RM, but double progression still counts the failed session.
    if (!newExStates[ex.id] && prevState) newExStates[ex.id] = { ...prevState };
    const r = nextAccessoryPrescription({
      sets: trained,
      repMin: slot.repMin,
      repMax: slot.repMax,
      increment: ex.increment,
      failCountBefore: prevState?.accessoryFailCount ?? 0,
      unit,
      minWeight: minLoad(ex.equipment, unit),
    });
    const exState = newExStates[ex.id] as ExerciseState | undefined;
    if (exState) Object.assign(exState, { accessoryFailCount: r.failCount, nextWeight: r.weight, nextReason: r.reason });
    return r;
  };

  // 2. Slot-level prescriptions.
  const trainedSlotIds = new Set<string>();
  for (const slot of allSlots) {
    const ex = exercises[slot.exerciseId];
    if (!ex) continue;
    const trained = sets
      .filter((s) => s.slotId === slot.slotId && s.exerciseId === slot.exerciseId)
      .sort((a, b) => a.setIndex - b.setIndex);
    const st = input.slotStates[slot.slotId];

    if (slot.progressionStyle === 'estimatedMax') {
      const exState = newExStates[ex.id];
      if (!exState) continue; // exercise wasn't trained today: nothing changed
      let baseline: number | undefined;
      let baselineKind: PrescriptionKind | undefined;
      let lastWorking: number | undefined;
      if (trained.length) {
        const first = trained[0];
        baseline = first.prescribedWeight ?? st?.nextWeight ?? undefined;
        baselineKind = first.prescriptionKind ?? st?.prescriptionKind;
        lastWorking = trained[trained.length - 1].weight;
        trainedSlotIds.add(slot.slotId);
      } else if (st) {
        // A deload waiting for this slot stays until the slot is actually trained.
        if (st.prescriptionKind === 'deload' && !deloadFlags.has(ex.id)) continue;
        baseline = st.lastPrescribedWeight;
        baselineKind = st.lastPrescribedKind;
        // Older states have no lastWorkingWeight; a calibration "prescription" was only a placeholder.
        lastWorking = st.lastWorkingWeight
          ?? (st.lastPrescribedKind !== 'calibration' ? st.lastPrescribedWeight : undefined)
          ?? st.nextWeight;
      } else {
        continue; // never trained and not trained now: on-demand prescription will use the e1RM
      }

      let nextWeight: number;
      let reason: string;
      let kind: PrescriptionKind = 'normal';
      if (deloadFlags.has(ex.id)) {
        nextWeight = deloadWeight(lastWorking!, ex, bodyweight, unit);
        kind = 'deload';
        reason = `Deload: 90% of your last working weight (${formatNumber(lastWorking!)} ${unit}) after two sessions below trend`;
      } else {
        ({ weight: nextWeight, reason } = nextMainPrescription({
          exercise: ex,
          slot,
          e1rm: exState.e1rm,
          baseline,
          baselineKind,
          returnPhase: rpAfter,
          bodyweight,
          unit,
        }));
      }
      newSlotStates[slot.slotId] = {
        slotId: slot.slotId,
        lastPrescribedWeight: trained.length ? baseline : st?.lastPrescribedWeight,
        lastPrescribedKind: trained.length ? baselineKind : st?.lastPrescribedKind,
        lastWorkingWeight: trained.length ? lastWorking : st?.lastWorkingWeight,
        nextWeight,
        reason,
        prescriptionKind: kind,
      };
    } else if (trained.length) {
      const r = progressAccessory(ex, slot, trained);
      trainedSlotIds.add(slot.slotId);
      newSlotStates[slot.slotId] = {
        slotId: slot.slotId,
        lastPrescribedWeight: trained[0].prescribedWeight ?? st?.nextWeight ?? undefined,
        lastPrescribedKind: trained[0].prescriptionKind ?? st?.prescriptionKind,
        lastWorkingWeight: trained[trained.length - 1].weight,
        nextWeight: r.weight,
        reason: r.reason,
        prescriptionKind: 'normal',
      };
    }

    // Accessory swapped in for this slot today: it progresses on its own state (the slot is left alone).
    const swapped = sets
      .filter((s) => s.slotId === slot.slotId && s.exerciseId !== slot.exerciseId)
      .sort((a, b) => a.setIndex - b.setIndex);
    const swapEx = swapped.length ? exercises[swapped[0].exerciseId] : undefined;
    if (swapEx && slot.progressionStyle === 'repsFirst') progressAccessory(swapEx, slot, swapped);
  }

  // 3. Summary: one line per slot trained today (swapped-in exercises use their own state).
  const summary: SummaryItem[] = [];
  const seenSlots = new Set<string>();
  for (const s of sets) {
    if (seenSlots.has(s.slotId)) continue;
    seenSlots.add(s.slotId);
    const slot = allSlots.find((x) => x.slotId === s.slotId);
    const ex = exercises[s.exerciseId];
    if (!slot || !ex) continue;
    const ns = newSlotStates[slot.slotId];
    if (ns && slot.exerciseId === s.exerciseId) {
      summary.push({ slotId: slot.slotId, exerciseId: ex.id, nextWeight: ns.nextWeight, reason: ns.reason, kind: ns.prescriptionKind });
    } else if (newExStates[ex.id]) {
      const p = prescribe({
        exercise: ex,
        slot,
        exerciseState: newExStates[ex.id],
        familyMembers: [],
        bodyweight,
        returnPhase: rpAfter,
        unit,
      });
      summary.push({ slotId: slot.slotId, exerciseId: ex.id, nextWeight: p.weight, reason: `${p.reason} (swapped exercise)`, kind: p.kind });
    }
  }

  return {
    exerciseStates: newExStates,
    slotStates: newSlotStates,
    returnPhase: rpAfter,
    summary,
    stronger,
    deloaded,
  };
}
