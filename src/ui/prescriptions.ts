import type { LoggedSet, Prescription, PrescriptionKind, SlotDef } from '../engine';
import { BAR_WEIGHT, isMaxStyle, prescribe, setsForMain, suggestNextWeight, targetsFor } from '../engine';
import type { Snapshot } from '../db/service';

/** Prescription for a slot, optionally for a swapped-in exercise. */
export function slotPrescription(snap: Snapshot, slot: SlotDef, exerciseId = slot.exerciseId): Prescription {
  const exercise = snap.exercises[exerciseId];
  return prescribe({
    exercise,
    slot,
    slotState: exerciseId === slot.exerciseId ? snap.slotStates[slot.slotId] : undefined,
    exerciseState: snap.exerciseStates[exerciseId],
    familyMembers: Object.values(snap.exercises).map((e) => ({ exercise: e, state: snap.exerciseStates[e.id] })),
    bodyweight: snap.settings.bodyweight ?? 0,
    returnPhase: snap.settings.returnPhase,
    unit: snap.settings.units,
  });
}

export function plannedSets(snap: Snapshot, slot: SlotDef): number {
  return isMaxStyle(slot) ? setsForMain(slot.sets, snap.settings.returnPhase) : slot.sets;
}

export interface SetDefaults {
  /** Weight to prefill. */
  weight: number;
  /** What the app prescribed for this set; null for a calibration set the user picks the weight of. */
  prescribedWeight: number | null;
  kind: PrescriptionKind;
  /** In-session suggestion note ("Suggested +2.5 kg — that looked easy"). */
  note: string | null;
}

/**
 * Prefill for set `setIndex` of a slot: the prescription for set 1, otherwise the in-session suggestion
 * from the previous logged set. Used for the current set and for the next-up strip.
 */
export function setDefaults(
  snap: Snapshot,
  slot: SlotDef,
  exerciseId: string,
  setIndex: number,
  previous: LoggedSet | undefined,
): SetDefaults {
  const { settings } = snap;
  const ex = snap.exercises[exerciseId];
  const rx = slotPrescription(snap, slot, exerciseId);
  if (setIndex > 0 && previous) {
    const targets = targetsFor(slot, settings.returnPhase);
    const prevKind = previous.prescriptionKind ?? rx.kind;
    const sug = suggestNextWeight({
      set: previous, kind: prevKind, exercise: ex, repMin: slot.repMin, repMax: slot.repMax,
      targetReps: targets.targetReps, targetRIR: targets.targetRIR, bodyweight: settings.bodyweight ?? 0, unit: settings.units,
    });
    return { weight: sug.weight, prescribedWeight: sug.weight, kind: prevKind === 'calibration' ? 'normal' : prevKind, note: sug.message };
  }
  const placeholder = ex.equipment === 'barbell' ? BAR_WEIGHT[settings.units] : 0;
  return { weight: rx.weight ?? placeholder, prescribedWeight: rx.weight, kind: rx.kind, note: null };
}

export const imageUrl = (id: string) => `${import.meta.env.BASE_URL}exercises/${id}.jpg`;

export const KIND_LABEL = { normal: '', calibration: 'Calibration', predicted: 'Predicted', deload: 'Deload' } as const;
