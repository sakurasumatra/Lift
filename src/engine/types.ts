export type Unit = 'kg' | 'lb';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band';
/** Estimated max = the main-lift model (e1RM drives the weight). Reps first = double progression. */
export type ProgressionStyle = 'estimatedMax' | 'repsFirst';
export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'quads' | 'hamstrings'
  | 'glutes' | 'calves' | 'abs' | 'traps' | 'hips' | 'full-body';
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
  equipment: Equipment;
  /** Smallest weight step in the user's current unit. */
  increment: number;
  primaryMuscle: MuscleGroup;
  /** Style a new slot starts with; each slot carries its own. */
  defaultProgressionStyle: ProgressionStyle;
  /** Movement family; without one the exercise can never be predicted (it starts with a calibration set). */
  family?: FamilyId;
  /** Transfer ratio to the family anchor (anchor = 1). */
  familyRatio?: number;
  isCustom?: boolean;
  /** Hidden from the library and pickers; kept so history still resolves. */
  hidden?: boolean;
  /** Free Exercise DB id of the bundled image, if any. */
  imageRef?: string;
  notes?: string;
}

export interface SlotDef {
  slotId: string;
  exerciseId: string;
  progressionStyle: ProgressionStyle;
  group: number;
  sets: number;
  repMin: number;
  repMax: number;
}

export interface Program {
  id: string;
  name: string;
  createdAt: number;
  /** Started from (or migrated from) the built-in 3-day template. */
  isTemplate: boolean;
}

export interface ProgramDay {
  id: string;
  programId: string;
  name: string;
  order: number;
  slots: SlotDef[];
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

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Machine', cable: 'Cable', bodyweight: 'Bodyweight', kettlebell: 'Kettlebell', band: 'Band',
};
export const EQUIPMENT_LIST = Object.keys(EQUIPMENT_LABELS) as Equipment[];

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', abs: 'Abs', traps: 'Traps', hips: 'Hips', 'full-body': 'Full body',
};
export const MUSCLE_LIST = Object.keys(MUSCLE_LABELS) as MuscleGroup[];

export const PROGRESSION_LABELS: Record<ProgressionStyle, string> = { estimatedMax: 'Estimated max', repsFirst: 'Reps first' };

/** True when the slot's weight comes from the e1RM model (a "main lift"). */
export const isMaxStyle = (slot: { progressionStyle: ProgressionStyle }): boolean => slot.progressionStyle === 'estimatedMax';
