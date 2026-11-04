import Dexie, { type Table } from 'dexie';
import type { ExerciseDef, ExerciseState, SlotState } from '../engine';
import { DEFAULT_INCREMENTS, DEFAULT_REST, defaultReturnPhase } from '../engine';
import { buildExerciseLibrary, buildSeedProgram } from '../data/library';
import type { ProgramDayRow, SessionRow, SetRow, SettingsRow } from './schema';

export class LiftDB extends Dexie {
  exercises!: Table<ExerciseDef, string>;
  programDays!: Table<ProgramDayRow, string>;
  slotState!: Table<SlotState, string>;
  sessions!: Table<SessionRow, string>;
  sets!: Table<SetRow, string>;
  exerciseState!: Table<ExerciseState, string>;
  settings!: Table<SettingsRow, string>;

  constructor(name = 'lift') {
    super(name);
    this.version(1).stores({
      exercises: 'id, family, type',
      programDays: 'id, order',
      slotState: 'slotId',
      sessions: 'id, dayId, startedAt, finishedAt',
      sets: 'id, sessionId, slotId, exerciseId, [sessionId+slotId], completedAt',
      exerciseState: 'exerciseId',
      settings: 'id',
    });
  }
}

export const defaultSettings = (): SettingsRow => ({
  id: 'main',
  units: 'kg',
  increments: { ...DEFAULT_INCREMENTS.kg },
  bodyweight: null,
  restTimes: { ...DEFAULT_REST },
  keepScreenAwake: true,
  timerSound: true,
  // The user is returning after 6+ months off: the return phase is on from the start.
  returnPhase: defaultReturnPhase(),
});

/** Seeds the exercise library, the A/B/C program and settings on first run. Idempotent. */
export async function ensureSeeded(db: LiftDB): Promise<void> {
  await db.transaction('rw', db.exercises, db.programDays, db.settings, async () => {
    if ((await db.settings.get('main')) == null) await db.settings.put(defaultSettings());
    if ((await db.exercises.count()) === 0) await db.exercises.bulkPut(buildExerciseLibrary('kg'));
    if ((await db.programDays.count()) === 0) await db.programDays.bulkPut(buildSeedProgram());
  });
}

export const db = new LiftDB();
