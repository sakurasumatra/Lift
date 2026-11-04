import type { SlotDef } from './types';

/**
 * Pure helpers for editing a day's slot list. Slots in consecutive positions that share a group
 * number are a superset, so every edit renumbers groups 1..n by consecutive runs.
 */
export function renumberGroups(slots: SlotDef[]): SlotDef[] {
  let g = 0;
  let prev: number | undefined;
  return slots.map((s) => {
    if (prev === undefined || s.group !== prev) g++;
    prev = s.group;
    return { ...s, group: g };
  });
}

const replaceAt = (slots: SlotDef[], i: number, patch: Partial<SlotDef>) =>
  slots.map((s, k) => (k === i ? { ...s, ...patch } : s));

/** Join slot i to the group of the slot before it. */
export function pairWithPrevious(slots: SlotDef[], i: number): SlotDef[] {
  if (i <= 0 || i >= slots.length) return slots;
  return renumberGroups(replaceAt(slots, i, { group: slots[i - 1].group }));
}

/** Split slot i out of its group so it runs as straight sets. */
export function unpair(slots: SlotDef[], i: number): SlotDef[] {
  if (i < 0 || i >= slots.length) return slots;
  return renumberGroups(replaceAt(slots, i, { group: slots[i].group + 0.5 }));
}

export function moveSlot(slots: SlotDef[], i: number, dir: -1 | 1): SlotDef[] {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= slots.length || j >= slots.length) return slots;
  const out = [...slots];
  [out[i], out[j]] = [out[j], out[i]];
  return renumberGroups(out);
}

export function removeSlot(slots: SlotDef[], i: number): SlotDef[] {
  return renumberGroups(slots.filter((_, k) => k !== i));
}

export function updateSlot(slots: SlotDef[], i: number, patch: Partial<Pick<SlotDef, 'exerciseId' | 'sets' | 'repMin' | 'repMax'>>): SlotDef[] {
  const next = { ...patch };
  if (next.sets != null) next.sets = Math.max(1, Math.round(next.sets));
  if (next.repMin != null) next.repMin = Math.max(1, Math.round(next.repMin));
  if (next.repMax != null) next.repMax = Math.max(1, Math.round(next.repMax));
  let out = replaceAt(slots, i, next);
  // keep repMin ≤ repMax: the field the user just edited wins
  const s = out[i];
  if (s.repMin > s.repMax) out = replaceAt(out, i, patch.repMax != null ? { repMin: s.repMax } : { repMax: s.repMin });
  return out;
}

export function newSlotId(dayId: string, slots: SlotDef[]): string {
  const re = new RegExp(`^${dayId}(\\d+)$`);
  const max = Math.max(0, ...slots.map((s) => Number(re.exec(s.slotId)?.[1] ?? 0)));
  return `${dayId}${max + 1}`;
}

/** Append a new straight-sets slot at the end of the day. */
export function addSlot(dayId: string, slots: SlotDef[], exerciseId: string, template: { sets: number; repMin: number; repMax: number } = { sets: 3, repMin: 8, repMax: 12 }): SlotDef[] {
  const group = Math.max(0, ...slots.map((s) => s.group)) + 1;
  return renumberGroups([...slots, { slotId: newSlotId(dayId, slots), exerciseId, group, ...template }]);
}
