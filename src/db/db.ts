import Dexie, { type Table } from 'dexie';
import type { ExerciseDef, ExerciseState, Program, SlotState } from '../engine';
import { DEFAULT_INCREMENTS, DEFAULT_REST, defaultReturnPhase } from '../engine';
import { buildExerciseLibrary, buildSeedProgram, seedProgramRow, SEED_PROGRAM_ID } from '../data/library';
import { migrateV1ToV2 } from './migrate';
import type { ProgramDayRow, SessionRow, SetRow, SettingsRow } from './schema';

export class LiftDB extends Dexie {
  exercises!: Table<ExerciseDef, string>;
  programs!: Table<Program, string>;
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
    // v2: saved programs, per-slot progression style, the broader exercise library.
    this.version(2)
      .stores({
        exercises: 'id, family, primaryMuscle, equipment',
        programs: 'id, createdAt',
        programDays: 'id, programId, order',
      })
      .upgrade(async (tx) => {
        const out = migrateV1ToV2({
          exercises: await tx.table('exercises').toArray(),
          programDays: await tx.table('programDays').toArray(),
          settings: await tx.table('settings').toArray(),
        });
        await tx.table('exercises').bulkPut(out.exercises);
        await tx.table('programs').bulkPut(out.programs);
        await tx.table('programDays').bulkPut(out.programDays);
        await tx.table('settings').bulkPut(out.settings);
      });
  }
}

export const defaultSettings = (): SettingsRow => ({
  id: 'main',
  units: 'kg',
  activeProgramId: SEED_PROGRAM_ID,
  increments: { ...DEFAULT_INCREMENTS.kg },
  bodyweight: null,
  restTimes: { ...DEFAULT_REST },
  keepScreenAwake: true,
  timerSound: true,
  // The user is returning after 6+ months off: the return phase is on from the start.
  returnPhase: defaultReturnPhase(),
});

/** Seeds the exercise library, the 3-day template program and settings on first run. Idempotent. */
export async function ensureSeeded(db: LiftDB): Promise<void> {
  await db.transaction('rw', db.exercises, db.programs, db.programDays, db.settings, async () => {
    const fresh = (await db.settings.get('main')) == null;
    if (fresh) await db.settings.put(defaultSettings());
    if ((await db.exercises.count()) === 0) await db.exercises.bulkPut(buildExerciseLibrary('kg'));
    // Only a first run gets the template program; later, having no program is a state the user chose.
    if (fresh) {
      await db.programs.put(seedProgramRow());
      await db.programDays.bulkPut(buildSeedProgram());
    }
  });
}

export const db = new LiftDB();
