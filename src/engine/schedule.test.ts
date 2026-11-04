import { describe, expect, it } from 'vitest';
import { buildQueue, isMaxStyle, setsForMain } from './index';
import { days } from './testkit';

const queueFor = (dayId: string, rp = { active: false, sessionsCompleted: 0 }) => {
  const day = days.find((d) => d.id === dayId)!;
  return buildQueue(
    day.slots.map((s) => ({
      slotId: s.slotId,
      group: s.group,
      sets: isMaxStyle(s) ? setsForMain(s.sets, rp) : s.sets,
      isMain: isMaxStyle(s),
    })),
  );
};

describe('superset scheduling', () => {
  it('alternates paired exercises and keeps straight sets for singletons', () => {
    const q = queueFor('A');
    expect(q.slice(0, 4).map((i) => i.slotId)).toEqual(['A1', 'A1', 'A1', 'A1']);
    expect(q.slice(4, 10).map((i) => i.slotId)).toEqual(['A2', 'A3', 'A2', 'A3', 'A2', 'A3']);
    expect(q.slice(10).map((i) => i.slotId)).toEqual(['A4', 'A5', 'A4', 'A5', 'A4', 'A5']);
    expect(q).toHaveLength(16);
  });
  it('rest: 75 s after the first of a pair, full rest after the second', () => {
    const q = queueFor('A');
    expect(q[0].restAfter).toBe(180); // straight main
    expect(q[4].restAfter).toBe(75); // bench → row
    expect(q[5].restAfter).toBe(180); // group contains a main lift
    expect(q[10].restAfter).toBe(75);
    expect(q[11].restAfter).toBe(90); // accessory-only pair
    expect(q[q.length - 1].restAfter).toBe(0);
  });
  it('return phase sessions 1–6 drop one set from main lifts only', () => {
    const q = queueFor('A', { active: true, sessionsCompleted: 0 });
    expect(q.filter((i) => i.slotId === 'A1')).toHaveLength(3);
    expect(q.filter((i) => i.slotId === 'A2')).toHaveLength(2); // bench 3 → 2
    expect(q.filter((i) => i.slotId === 'A3')).toHaveLength(3); // accessory unchanged
  });
  it('extra sets of an uneven pair run as straight sets at the end of the group', () => {
    const q = buildQueue([
      { slotId: 'x', group: 1, sets: 2, isMain: true },
      { slotId: 'y', group: 1, sets: 3, isMain: false },
    ]);
    expect(q.map((i) => i.slotId)).toEqual(['x', 'y', 'x', 'y', 'y']);
    expect(q.map((i) => i.restAfter)).toEqual([75, 180, 75, 180, 0]);
  });
  it('honours a custom group order', () => {
    const q = buildQueue(
      [
        { slotId: 'a', group: 1, sets: 1, isMain: false },
        { slotId: 'b', group: 2, sets: 1, isMain: false },
      ],
      undefined,
      [2, 1],
    );
    expect(q.map((i) => i.slotId)).toEqual(['b', 'a']);
  });
});
