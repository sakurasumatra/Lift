import { describe, expect, it } from 'vitest';
import {
  ALPHA, effectiveLoad, floorToIncrement, convertWeight, isMiss, plateBreakdown,
  rpeToRir, sessionE1rm, setE1rm, smoothE1rm, DEFAULT_INCREMENTS,
} from './index';

describe('RPE → RIR', () => {
  it('converts 6–10', () => {
    expect([6, 7, 8, 9, 10].map(rpeToRir)).toEqual([4, 3, 2, 1, 0]);
  });
  it('assumes RIR 1 when RPE is missing', () => {
    expect(rpeToRir(undefined)).toBe(1);
    expect(rpeToRir(null)).toBe(1);
  });
});

describe('e1RM maths', () => {
  it('Epley with RIR', () => {
    expect(setE1rm(100, 5, 2)).toBeCloseTo(100 * (1 + 7 / 30), 6);
  });
  it('uses logged weight for barbell/dumbbell/machine/cable', () => {
    for (const eq of ['barbell', 'dumbbell', 'machine', 'cable'] as const) {
      expect(effectiveLoad(eq, 50, 80)).toBe(50);
    }
  });
  it('bodyweight: effective load = bodyweight + added load', () => {
    expect(effectiveLoad('bodyweight', 10, 80)).toBe(90);
  });
  it('bodyweight with assistance (negative added load)', () => {
    expect(effectiveLoad('bodyweight', -20, 80)).toBe(60);
    // 8 reps at RPE 9 (RIR 1) with 20 kg assistance
    expect(sessionE1rm('bodyweight', [{ weight: -20, reps: 8, rpe: 9 }], 80)).toBeCloseTo(60 * (1 + 9 / 30), 6);
  });
  it('session e1RM is the best set', () => {
    const e = sessionE1rm('barbell', [
      { weight: 100, reps: 5, rpe: 8 },
      { weight: 105, reps: 5, rpe: 8 },
      { weight: 100, reps: 4, rpe: 8 },
    ], 80);
    expect(e).toBeCloseTo(105 * (1 + 7 / 30), 6);
  });
  it('uses RIR 1 for sets without RPE', () => {
    expect(sessionE1rm('machine', [{ weight: 50, reps: 10 }], 80)).toBeCloseTo(50 * (1 + 11 / 30), 6);
  });
});

describe('smoothing', () => {
  it('first session takes the session value', () => expect(smoothE1rm(undefined, 123)).toBe(123));
  it('α = 0.35 normally', () => expect(smoothE1rm(100, 110)).toBeCloseTo(100 + ALPHA * 10, 6));
  it('α = 0.6 for upward moves in the return phase', () => expect(smoothE1rm(100, 110, true)).toBeCloseTo(106, 6));
  it('return phase does not speed up downward moves', () => expect(smoothE1rm(100, 90, true)).toBeCloseTo(96.5, 6));
  it('miss = below 98% of previous smoothed', () => {
    expect(isMiss(97.9, 100)).toBe(true);
    expect(isMiss(98, 100)).toBe(false);
  });
});

describe('rounding', () => {
  it('rounds down to the nearest increment in kg', () => {
    expect(floorToIncrement(61.9, 2.5)).toBe(60);
    expect(floorToIncrement(62.5, 2.5)).toBe(62.5);
    expect(floorToIncrement(13, 2)).toBe(12);
  });
  it('rounds down to the nearest increment in lb', () => {
    expect(floorToIncrement(137, 5)).toBe(135);
    expect(floorToIncrement(135, 5)).toBe(135);
  });
  it('is stable against floating point noise', () => {
    expect(floorToIncrement(0.1 + 0.2 + 62.2, 2.5)).toBe(62.5);
    expect(floorToIncrement(62.5 - 1e-12, 2.5)).toBe(62.5);
  });
  it('handles negative added load (assistance) by rounding down', () => {
    expect(floorToIncrement(-3.2, 2.5)).toBe(-5);
    expect(floorToIncrement(-5, 2.5)).toBe(-5);
  });
  it('default increments per spec', () => {
    expect(DEFAULT_INCREMENTS.kg).toEqual({ barbell: 2.5, dumbbell: 2, machine: 2.5, cable: 2.5, bodyweight: 2.5 });
    expect(DEFAULT_INCREMENTS.lb.dumbbell).toBe(5);
  });
  it('converts units', () => {
    expect(convertWeight(100, 'kg', 'lb')).toBeCloseTo(220.46, 1);
    expect(convertWeight(220.462, 'lb', 'kg')).toBeCloseTo(100, 1);
    expect(convertWeight(5, 'kg', 'kg')).toBe(5);
  });
});

describe('plate breakdown', () => {
  it('kg', () => {
    expect(plateBreakdown(100, 'kg')).toEqual({ perSide: [25, 15], remainder: 0 });
    expect(plateBreakdown(62.5, 'kg').perSide).toEqual([20, 1.25]);
    expect(plateBreakdown(20, 'kg').perSide).toEqual([]);
  });
  it('lb', () => {
    expect(plateBreakdown(135, 'lb').perSide).toEqual([45]);
    expect(plateBreakdown(225, 'lb').perSide).toEqual([45, 45]);
  });
});
