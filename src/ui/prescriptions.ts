import type { Prescription, SlotDef } from '../engine';
import { prescribe, setsForMain } from '../engine';
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

export function plannedSets(snap: Snapshot, slot: SlotDef, exerciseId = slot.exerciseId): number {
  return snap.exercises[exerciseId].type === 'main' ? setsForMain(slot.sets, snap.settings.returnPhase) : slot.sets;
}

export const imageUrl = (id: string) => `${import.meta.env.BASE_URL}exercises/${id}.jpg`;

export const KIND_LABEL = { normal: '', calibration: 'Calibration', predicted: 'Predicted', deload: 'Deload' } as const;
