import type { Equipment, Unit } from './types';

const KG_PER_LB = 0.45359237;
const EPS = 1e-9;

/** Round DOWN to the nearest multiple of `increment` (works for negative added loads too). */
export function floorToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value;
  return clean(Math.floor(value / increment + EPS) * increment);
}

/** Strip floating-point noise (e.g. 62.50000000001). */
export function clean(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function convertWeight(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  return from === 'kg' ? value / KG_PER_LB : value * KG_PER_LB;
}

export const DEFAULT_INCREMENTS: Record<Unit, Record<Equipment, number>> = {
  kg: { barbell: 2.5, dumbbell: 2, machine: 2.5, cable: 2.5, bodyweight: 2.5 },
  lb: { barbell: 5, dumbbell: 5, machine: 5, cable: 5, bodyweight: 5 },
};

export const BAR_WEIGHT: Record<Unit, number> = { kg: 20, lb: 45 };

/** "62.5", "60" — no trailing zeros. */
export function formatNumber(value: number, digits = 2): string {
  return String(Number(value.toFixed(digits)));
}

export function formatWeight(value: number, unit: Unit): string {
  return `${formatNumber(value)} ${unit}`;
}

export function formatSigned(value: number, unit: Unit): string {
  const sign = value < 0 ? '−' : '+';
  return `${sign}${formatNumber(Math.abs(value))} ${unit}`;
}
