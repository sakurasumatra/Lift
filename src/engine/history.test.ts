import { describe, expect, it } from 'vitest';
import { bestSets, e1rmSeries } from './index';

const sets = [
  { sessionId: 's2', at: 200, weight: 100, reps: 5, rpe: 8 },
  { sessionId: 's1', at: 100, weight: 90, reps: 5, rpe: 8 },
  { sessionId: 's1', at: 101, weight: 95, reps: 5, rpe: 8 },
  { sessionId: 's2', at: 201, weight: 100, reps: 3, rpe: 8 },
];

describe('history helpers', () => {
  it('series: best set per session, oldest first', () => {
    const s = e1rmSeries('barbell', sets, 80);
    expect(s.map((p) => p.sessionId)).toEqual(['s1', 's2']);
    expect(s[0].e1rm).toBeCloseTo(95 * (1 + 7 / 30), 6);
    expect(s[1].e1rm).toBeCloseTo(100 * (1 + 7 / 30), 6);
  });
  it('bodyweight series use effective load', () => {
    const s = e1rmSeries('bodyweight', [{ sessionId: 'a', at: 1, weight: -20, reps: 8, rpe: 9 }], 80);
    expect(s[0].e1rm).toBeCloseTo(60 * (1 + 9 / 30), 6);
  });
  it('best sets ranked by e1RM, limited to n', () => {
    const b = bestSets('barbell', sets, 80, 2);
    expect(b).toHaveLength(2);
    expect(b[0].weight).toBe(100);
    expect(b[0].reps).toBe(5);
  });
  it('ignores zero-rep sets', () => {
    expect(e1rmSeries('barbell', [{ sessionId: 'a', at: 1, weight: 100, reps: 0 }], 80)).toEqual([]);
  });
});
