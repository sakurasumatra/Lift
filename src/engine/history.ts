import { effectiveLoad, rpeToRir, setE1rm } from './e1rm';
import type { Equipment } from './types';

export interface HistorySet {
  sessionId: string;
  at: number;
  weight: number;
  reps: number;
  rpe?: number | null;
}

export interface E1rmPoint { sessionId: string; at: number; e1rm: number; }
export interface BestSet extends HistorySet { e1rm: number; }

const e1rmOf = (equipment: Equipment, s: HistorySet, bodyweight: number) =>
  setE1rm(effectiveLoad(equipment, s.weight, bodyweight), s.reps, rpeToRir(s.rpe));

/** Best set e1RM per session, oldest first. */
export function e1rmSeries(equipment: Equipment, sets: HistorySet[], bodyweight: number): E1rmPoint[] {
  const by = new Map<string, E1rmPoint>();
  for (const s of sets) {
    if (s.reps <= 0) continue;
    const e = e1rmOf(equipment, s, bodyweight);
    const cur = by.get(s.sessionId);
    if (!cur) by.set(s.sessionId, { sessionId: s.sessionId, at: s.at, e1rm: e });
    else { cur.e1rm = Math.max(cur.e1rm, e); cur.at = Math.min(cur.at, s.at); }
  }
  return [...by.values()].sort((a, b) => a.at - b.at);
}

/** Top sets by estimated one-rep max. */
export function bestSets(equipment: Equipment, sets: HistorySet[], bodyweight: number, n = 5): BestSet[] {
  return sets
    .filter((s) => s.reps > 0)
    .map((s) => ({ ...s, e1rm: e1rmOf(equipment, s, bodyweight) }))
    .sort((a, b) => b.e1rm - a.e1rm)
    .slice(0, n);
}
