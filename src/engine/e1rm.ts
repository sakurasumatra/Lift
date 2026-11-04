import type { Equipment } from './types';

export const DEFAULT_RIR = 1;
export const ALPHA = 0.35;
export const ALPHA_RETURN_UP = 0.6;
export const MISS_THRESHOLD = 0.98;

/** RPE (6–10) → reps in reserve. Missing RPE (accessories) assumes RIR 1. */
export function rpeToRir(rpe?: number | null): number {
  if (rpe == null) return DEFAULT_RIR;
  return Math.max(0, Math.min(4, 10 - rpe));
}

export function rirToRpe(rir: number): number {
  return 10 - rir;
}

/** Effective load: logged weight, or bodyweight + added load (negative = assistance). */
export function effectiveLoad(equipment: Equipment, weight: number, bodyweight: number): number {
  if (equipment === 'bodyweight') return Math.max(0, bodyweight + weight);
  return weight;
}

/** Epley with RIR. */
export function setE1rm(load: number, reps: number, rir: number): number {
  return load * (1 + (reps + rir) / 30);
}

export interface E1rmSetInput {
  weight: number;
  reps: number;
  rpe?: number | null;
}

export function sessionE1rm(
  equipment: Equipment,
  sets: E1rmSetInput[],
  bodyweight: number,
): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.reps <= 0) continue;
    const e = setE1rm(effectiveLoad(equipment, s.weight, bodyweight), s.reps, rpeToRir(s.rpe));
    if (best == null || e > best) best = e;
  }
  return best;
}

/** Smoothed e1RM update. First session: take the session value outright. */
export function smoothE1rm(
  old: number | undefined,
  session: number,
  returnPhaseActive = false,
): number {
  if (old == null) return session;
  const alpha = returnPhaseActive && session > old ? ALPHA_RETURN_UP : ALPHA;
  return old + alpha * (session - old);
}

export function isMiss(session: number, previousSmoothed: number): boolean {
  return session < MISS_THRESHOLD * previousSmoothed;
}
