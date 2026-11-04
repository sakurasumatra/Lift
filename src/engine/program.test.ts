import { describe, expect, it } from 'vitest';
import { addSlot, moveSlot, newSlotId, pairWithPrevious, removeSlot, renumberGroups, unpair, updateSlot } from './index';
import { days } from './testkit';

const A = days[0].slots; // groups 1,2,2,3,3
const groups = (s: { group: number }[]) => s.map((x) => x.group);

describe('program editing helpers', () => {
  it('renumbers by consecutive runs', () => {
    expect(groups(renumberGroups(A.map((s, i) => ({ ...s, group: [5, 9, 9, 12, 12][i] }))))).toEqual([1, 2, 2, 3, 3]);
  });
  it('pairs with the previous slot', () => {
    expect(groups(pairWithPrevious(A, 1))).toEqual([1, 1, 2, 3, 3]); // squat + bench; row splits off
    expect(pairWithPrevious(A, 0)).toBe(A);
  });
  it('unpairs a slot', () => {
    expect(groups(unpair(A, 2))).toEqual([1, 2, 3, 4, 4]);
    expect(groups(unpair(A, 1))).toEqual([1, 2, 3, 4, 4]);
  });
  it('moves slots and keeps groups consistent', () => {
    const m = moveSlot(A, 1, 1); // swap bench and row: still a pair
    expect(m.map((s) => s.slotId)).toEqual(['A1', 'A3', 'A2', 'A4', 'A5']);
    expect(groups(m)).toEqual([1, 2, 2, 3, 3]);
    expect(moveSlot(A, 0, -1)).toBe(A);
  });
  it('removes a slot', () => {
    const r = removeSlot(A, 1);
    expect(r).toHaveLength(4);
    expect(groups(r)).toEqual([1, 2, 3, 3]);
  });
  it('adds a straight-sets slot with a fresh id', () => {
    const a = addSlot('A', A, 'dumbbell-curl');
    expect(a[5]).toMatchObject({ slotId: 'A6', exerciseId: 'dumbbell-curl', group: 4, sets: 3 });
    expect(newSlotId('A', removeSlot(A, 4))).toBe('A5'); // never reuses an id still present
    expect(newSlotId('A', [])).toBe('A1');
  });
  it('edits sets and reps, keeping repMin ≤ repMax', () => {
    expect(updateSlot(A, 0, { sets: 5 })[0].sets).toBe(5);
    expect(updateSlot(A, 0, { sets: 0 })[0].sets).toBe(1);
    expect(updateSlot(A, 0, { repMin: 9 })[0]).toMatchObject({ repMin: 9, repMax: 9 }); // 4–6 → min 9
    expect(updateSlot(A, 0, { repMax: 2 })[0]).toMatchObject({ repMin: 2, repMax: 2 });
  });
});
