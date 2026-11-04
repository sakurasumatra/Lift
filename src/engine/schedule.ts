export interface RestTimes {
  /** Rest after the first exercise of a superset pair (seconds). */
  pair: number;
  /** Full rest for a group containing a main lift. */
  main: number;
  /** Full rest for an accessory-only group. */
  accessory: number;
}

export const DEFAULT_REST: RestTimes = { pair: 75, main: 180, accessory: 90 };

export interface QueueSlot {
  slotId: string;
  group: number;
  sets: number;
  isMain: boolean;
}

export interface QueueItem {
  slotId: string;
  group: number;
  setIndex: number;
  /** Seconds of rest after this set; 0 for the last set of the session. */
  restAfter: number;
}

/**
 * Order of sets for a day. Groups run in the given order (by first appearance). Within a group
 * the sets alternate between its exercises; if set counts differ, the extra sets run straight at
 * the end of the group. Rest is 75 s between a superset pair and the full rest after the pair.
 */
export function buildQueue(
  slots: QueueSlot[],
  rest: RestTimes = DEFAULT_REST,
  groupOrder?: number[],
): QueueItem[] {
  const groups = new Map<number, QueueSlot[]>();
  for (const s of slots) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group)!.push(s);
  }
  const order = groupOrder
    ? [...groupOrder.filter((g) => groups.has(g)), ...[...groups.keys()].filter((g) => !groupOrder.includes(g))]
    : [...groups.keys()].sort((a, b) => a - b);

  const queue: QueueItem[] = [];
  for (const g of order) {
    const members = groups.get(g)!;
    const full = members.some((m) => m.isMain) ? rest.main : rest.accessory;
    const maxSets = Math.max(...members.map((m) => m.sets));
    const start = queue.length;
    for (let i = 0; i < maxSets; i++) {
      for (const m of members) {
        if (i < m.sets) queue.push({ slotId: m.slotId, group: g, setIndex: i, restAfter: full });
      }
    }
    for (let k = start; k < queue.length - 1; k++) {
      if (queue[k + 1].group === g && queue[k + 1].setIndex === queue[k].setIndex && queue[k + 1].slotId !== queue[k].slotId) {
        queue[k].restAfter = rest.pair;
      }
    }
  }
  if (queue.length) queue[queue.length - 1].restAfter = 0;
  return queue;
}
