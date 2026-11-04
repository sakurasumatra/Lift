import type { ReturnPhase } from './types';

export const RETURN_REDUCED_SESSIONS = 6;
export const RETURN_TOTAL_SESSIONS = 12;

export const defaultReturnPhase = (): ReturnPhase => ({ active: true, sessionsCompleted: 0 });

/** The 1-based number of the session being (or about to be) trained, or null when the phase is off. */
export function returnSessionNumber(rp: ReturnPhase): number | null {
  return rp.active ? rp.sessionsCompleted + 1 : null;
}

/** Sessions 1–6 of the return phase. */
export function isReducedPhase(rp: ReturnPhase): boolean {
  const n = returnSessionNumber(rp);
  return n != null && n <= RETURN_REDUCED_SESSIONS;
}

export function targetRirFor(rp: ReturnPhase): number {
  return isReducedPhase(rp) ? 3 : 2;
}

/** Main lifts run one set fewer during sessions 1–6. */
export function setsForMain(programmedSets: number, rp: ReturnPhase): number {
  return isReducedPhase(rp) ? Math.max(1, programmedSets - 1) : programmedSets;
}

/** Call once per finished session (with at least one logged set). Phase ends after 12 sessions. */
export function advanceReturnPhase(rp: ReturnPhase): ReturnPhase {
  if (!rp.active) return rp;
  const sessionsCompleted = rp.sessionsCompleted + 1;
  return { active: sessionsCompleted < RETURN_TOTAL_SESSIONS, sessionsCompleted };
}
