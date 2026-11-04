import type { LiftDB } from './db';

export const BACKUP_VERSION = 1;
const TABLES = ['exercises', 'programDays', 'slotState', 'sessions', 'sets', 'exerciseState', 'settings'] as const;
type TableName = (typeof TABLES)[number];

export interface BackupFile {
  app: 'lift';
  version: number;
  exportedAt: string;
  tables: Record<TableName, Record<string, unknown>[]>;
}

export async function exportData(db: LiftDB): Promise<BackupFile> {
  const tables = {} as BackupFile['tables'];
  for (const t of TABLES) tables[t] = (await db.table(t).toArray()) as Record<string, unknown>[];
  return { app: 'lift', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Throws a readable Error when the file isn't a usable Lift backup. */
export function validateBackup(x: unknown): BackupFile {
  if (!isObj(x) || x.app !== 'lift') throw new Error('This file is not a Lift backup.');
  if (x.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version: ${String(x.version)}.`);
  if (!isObj(x.tables)) throw new Error('The backup has no data tables.');
  const tables = x.tables;
  for (const t of TABLES) if (!Array.isArray(tables[t]) || !(tables[t] as unknown[]).every(isObj)) throw new Error(`The backup is missing or has a malformed "${t}" table.`);
  const need = (t: TableName, key: string) => {
    if (!(tables[t] as Record<string, unknown>[]).every((r) => typeof r[key] === 'string')) throw new Error(`A row in "${t}" is missing its ${key}.`);
  };
  need('exercises', 'id'); need('programDays', 'id'); need('slotState', 'slotId'); need('sessions', 'id');
  need('sets', 'id'); need('exerciseState', 'exerciseId'); need('settings', 'id');
  const settings = tables.settings as Record<string, unknown>[];
  if (settings.length !== 1 || settings[0].id !== 'main') throw new Error('The backup settings are invalid.');
  if (settings[0].units !== 'kg' && settings[0].units !== 'lb') throw new Error('The backup has an invalid unit setting.');
  if ((tables.programDays as Record<string, unknown>[]).some((d) => !Array.isArray(d.slots))) throw new Error('A program day in the backup has no slots.');
  if ((tables.exercises as unknown[]).length === 0) throw new Error('The backup contains no exercises.');
  return x as unknown as BackupFile;
}

/** Replaces ALL data with the backup's contents, atomically. */
export async function importData(db: LiftDB, raw: unknown): Promise<void> {
  const file = validateBackup(raw);
  await db.transaction('rw', db.tables, async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkPut(file.tables[t]);
    }
  });
}
