export type Unit = 'kg' | 'lb';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';
export type ExerciseType = 'main' | 'accessory';
export type PrescriptionKind = 'normal' | 'calibration' | 'predicted' | 'deload';
export type FamilyId =
  | 'horizontal-press'
  | 'squat'
  | 'hinge'
  | 'vertical-press'
  | 'row'
  | 'vertical-pull'
  | 'pull-up'
  | 'leg-curl'
  | 'lateral-raise'
  | 'curl'
  | 'triceps';

export interface ExerciseDef {
  id: string;
  name: string;
  type: ExerciseType;
  equipment: Equipment;
  /** Smallest weight step in the user's current unit. */
  increment: number;
  family: FamilyId;
  /** Transfer ratio to the family anchor (anchor = 1). */
  familyRatio: number;
  notes?: string;
}

export interface SlotDef {
  slotId: string;
  exerciseId: string;
  group: number;
  sets: number;
  repMin: number;
  repMax: number;
}

export interface ExerciseState {
  exerciseId: string;
  /** Smoothed e1RM in effective load (bodyweight included for bodyweight exercises). */
  e1rm: number;
  missCount: number;
  accessoryFailCount: number;
  predictedFrom?: string;
  updatedAt: number;
  /** Number of logged sessions. 0 for a seeded exercise that has never been logged. */
  sessionCount: number;
  /** Last working weight (logged-weight terms); used when there is no slot state (swaps, seeds). */
  lastWeight?: number;
  /** Accessories: next weight from double progression, used when there is no slot state (swaps). */
  nextWeight?: number;
  nextReason?: string;
  /** Seeded with a 3+ month gap: the first set of the first session is a calibration set. */
  calibrateFirst?: boolean;
}

export interface SlotState {
  slotId: string;
  /** Weight prescribed for the last session in which this slot was actually trained. */
  lastPrescribedWeight?: number;
  lastPrescribedKind?: PrescriptionKind;
  /** Weight of the last set logged the last time this slot was trained (deloads take 90% of it). */
  lastWorkingWeight?: number;
  nextWeight: number;
  reason: string;
  prescriptionKind: PrescriptionKind;
}

export interface ReturnPhase {
  active: boolean;
  sessionsCompleted: number;
}

export interface Prescription {
  /** Weight in logged terms (added load for bodyweight). null = user must enter one (calibration). */
  weight: number | null;
  kind: PrescriptionKind;
  reason: string;
  targetReps: number;
  targetRIR: number;
  /** Source exercise id for predicted prescriptions. */
  predictedFrom?: string;
}

export interface LoggedSet {
  slotId: string;
  exerciseId: string;
  setIndex: number;
  weight: number;
  reps: number;
  rpe?: number | null;
  prescribedWeight?: number | null;
  prescriptionKind?: PrescriptionKind;
}

export interface SummaryItem {
  slotId: string;
  exerciseId: string;
  nextWeight: number | null;
  reason: string;
  kind: PrescriptionKind;
}

export interface StrongerCard {
  exerciseId: string;
  oldE1rm: number;
  newE1rm: number;
  delta: number;
}

export const FAMILY_LABELS: Record<FamilyId, string> = {
  'horizontal-press': 'Horizontal press',
  squat: 'Squat',
  hinge: 'Hinge',
  'vertical-press': 'Vertical press',
  row: 'Row',
  'vertical-pull': 'Vertical pull',
  'pull-up': 'Pull-up',
  'leg-curl': 'Leg curl',
  'lateral-raise': 'Lateral raise',
  curl: 'Curl',
  triceps: 'Triceps',
};
