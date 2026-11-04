import type { SessionRow } from '../db/schema';
import type { Snapshot } from '../db/service';

/** One character for the day tile: "Day B" → B, "Push" → P. */
export const dayBadge = (name: string): string => {
  const m = /^Day (\S)\b/.exec(name.trim());
  return (m ? m[1] : name.trim()[0] ?? '•').toUpperCase();
};

/** A session's day name: the one saved at the time, else the day's current name, else the legacy id ("A" → "Day A"). */
export function sessionDayName(snap: Snapshot, s: Pick<SessionRow, 'dayId' | 'dayName'>): string {
  return s.dayName ?? snap.days.find((d) => d.id === s.dayId)?.name ?? (s.dayId.length <= 2 ? `Day ${s.dayId}` : 'Workout');
}
