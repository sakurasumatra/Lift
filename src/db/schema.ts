import type {
  Equipment, ExerciseDef, ExerciseState, LoggedSet, PrescriptionKind, ReturnPhase, SlotDef, SlotState,
  RestTimes, StrongerCard, SummaryItem, Unit,
} from '../engine';

export interface ProgramDayRow {
  id: string;
  label: string;
  order: number;
  slots: SlotDef[];
}

export interface Swap {
  slotId: string;
  fromExerciseId: string;
  toExerciseId: string;
}

export interface SessionSummary {
  items: SummaryItem[];
  stronger: StrongerCard[];
  deloaded: string[];
  totalSets: number;
  returnSessionNumber: number | null;
}

export interface SessionRow {
  id: string;
  dayId: string;
  startedAt: number;
  finishedAt?: number;
  endedEarly?: boolean;
  swaps: Swap[];
  /** Slots skipped during this session. */
  skippedSlotIds?: string[];
  /** Custom group order chosen during this session. */
  groupOrder?: number[];
  summary?: SessionSummary;
}

export interface SetRow extends LoggedSet {
  id: string;
  sessionId: string;
  prescribedWeight: number | null;
  prescriptionKind: PrescriptionKind;
  completedAt: number;
}

export interface SettingsRow {
  id: 'main';
  units: Unit;
  increments: Record<Equipment, number>;
  bodyweight: number | null;
  restTimes: RestTimes;
  keepScreenAwake: boolean;
  timerSound: boolean;
  returnPhase: ReturnPhase;
  /** Set once the starting-weights onboarding was completed or skipped. */
  onboarded?: boolean;
}

export type { ExerciseDef, ExerciseState, SlotState };
