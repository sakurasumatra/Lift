import type { Unit } from './types';
import { BAR_WEIGHT, clean } from './units';

const PLATES: Record<Unit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

export interface PlateBreakdown {
  perSide: number[];
  /** Weight per side that couldn't be made with the plates above (0 when exact). */
  remainder: number;
}

/** Greedy per-side plate breakdown for a barbell total load. */
export function plateBreakdown(total: number, unit: Unit): PlateBreakdown {
  let rest = clean((total - BAR_WEIGHT[unit]) / 2);
  const perSide: number[] = [];
  if (rest <= 0) return { perSide, remainder: 0 };
  for (const p of PLATES[unit]) {
    while (rest + 1e-9 >= p) {
      perSide.push(p);
      rest = clean(rest - p);
    }
  }
  return { perSide, remainder: rest };
}
