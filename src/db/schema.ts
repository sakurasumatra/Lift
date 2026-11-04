import type {
  Equipment, ExerciseDef, ExerciseState, LoggedSet, PrescriptionKind, ReturnPhase, SlotState,
  RestTimes, StrongerCard, Program, ProgramDay, SummaryItem, Unit,
} from '../engine';

export type ProgramDayRow = ProgramDay;

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
  /** The day's name when the session started, so renaming or deleting the day never rewrites history. */
  dayName?: string;
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
  /** The program whose days the Home screen rotates through. */
  activeProgramId: string | null;
  /** Set once the starting-weights onboarding was completed or skipped. */
  onboarded?: boolean;
}

export type { ExerciseDef, ExerciseState, Program, SlotState };
