import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { activeSession, loadSnapshot, setsForSession } from '../db/service';

export const useSnapshot = () => useLiveQuery(() => loadSnapshot(db), []);
export const useActiveSession = () => useLiveQuery(async () => (await activeSession(db)) ?? null, []);
export const useSessionSets = (sessionId: string | undefined) =>
  useLiveQuery(async () => (sessionId ? setsForSession(db, sessionId) : []), [sessionId]) ?? [];
export const useSession = (sessionId: string | undefined) =>
  useLiveQuery(async () => (sessionId ? ((await db.sessions.get(sessionId)) ?? null) : null), [sessionId]);
