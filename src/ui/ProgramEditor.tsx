import { useRef, useState } from 'react';
import { db } from '../db/db';
import type { Snapshot } from '../db/service';
import { addDay, MAX_DAYS, moveDay, newSlotId, removeDay, renameDay } from '../db/programService';
import { saveProgramDay } from '../db/settingsService';
import {
  addSlot, EQUIPMENT_LABELS, moveSlot, moveSlotTo, pairWithPrevious, PROGRESSION_LABELS, removeSlot, unpair, updateSlot,
  type ProgressionStyle, type SlotDef,
} from '../engine';
import { Sheet } from './components';
import { ExerciseBrowser } from './ExerciseBrowser';
import { ExerciseForm } from './ExerciseForm';
import { NumField, SubHeader } from './fields';
import { useActiveSession } from './hooks';

type Picking = { mode: 'add' } | { mode: 'change'; index: number } | null;

/** Edit one program: its days (1–7, named, ordered) and each day's slots. */
export function ProgramEditor({ snap, programId, onBack }: { snap: Snapshot; programId: string; onBack: () => void }) {
  const program = snap.programs.find((p) => p.id === programId);
  const days = snap.days.filter((d) => d.programId === programId).sort((a, b) => a.order - b.order);
  const [dayId, setDayId] = useState<string | undefined>(days[0]?.id);
  const [picking, setPicking] = useState<Picking>(null);
  const [creating, setCreating] = useState(false);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const active = useActiveSession();
  const day = days.find((d) => d.id === dayId) ?? days[0];

  if (!program || !day) return <div className="page"><SubHeader title="Program" onBack={onBack} /><div className="card muted">This program no longer exists.</div></div>;

  const slots = day.slots;
  const save = (next: SlotDef[]) => saveProgramDay(db, day.id, next);
  const styleFor = (exerciseId: string): ProgressionStyle => snap.exercises[exerciseId]?.defaultProgressionStyle ?? 'repsFirst';

  function pick(exerciseId: string) {
    if (picking?.mode === 'add') save(addSlot(slots, exerciseId, { slotId: newSlotId(), progressionStyle: styleFor(exerciseId) }));
    else if (picking?.mode === 'change') save(updateSlot(slots, picking.index, { exerciseId, progressionStyle: styleFor(exerciseId) }));
    setPicking(null);
  }

  // Drag a slot by its handle: the card under the pointer is the drop position.
  const overIndex = (y: number) => {
    let best = 0;
    cards.current.forEach((el, k) => { if (el && y >= el.getBoundingClientRect().top) best = k; });
    return best;
  };

  return (
    <div className="page">
      <SubHeader title={program.name} onBack={onBack} />
      {active && <div className="explainer">A workout is in progress. Finish it before editing programs.</div>}
      <div className="chip-row">
        {days.map((d) => <button key={d.id} className={`btn small ${d.id === day.id ? 'primary' : 'secondary'}`} onClick={() => setDayId(d.id)}>{d.name}</button>)}
        <button className="btn small secondary" disabled={days.length >= MAX_DAYS || !!active} onClick={async () => { const id = await addDay(db, programId); if (id) setDayId(id); }} aria-label="Add day">＋ Day</button>
      </div>
      <fieldset disabled={!!active} style={{ border: 0, padding: 0, margin: 0, display: 'contents' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="muted" style={{ fontSize: 12 }}>Day name
            <input className="text" key={day.id + day.name} aria-label="Day name" defaultValue={day.name} onBlur={(e) => renameDay(db, day.id, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          </label>
          <div className="row">
            <button className="btn secondary small grow" disabled={day.order === 0} onClick={() => moveDay(db, day.id, -1)}>← Earlier</button>
            <button className="btn secondary small grow" disabled={day.order === days.length - 1} onClick={() => moveDay(db, day.id, 1)}>Later →</button>
            <button className="btn secondary small" disabled={days.length <= 1} aria-label="Remove day" onClick={async () => {
              if (!window.confirm(`Remove ${day.name}? Your workout history is kept.`)) return;
              await removeDay(db, day.id);
              setDayId(days.find((d) => d.id !== day.id)?.id);
            }}>Remove day</button>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Workouts rotate through the days in this order.</div>
        </div>

        {slots.length === 0 && <div className="card muted">No exercises on this day yet. Add one below.</div>}
        {slots.map((s, i) => {
          const ex = snap.exercises[s.exerciseId];
          const paired = (i > 0 && slots[i - 1].group === s.group) || (i < slots.length - 1 && slots[i + 1].group === s.group);
          return (
            <div className={`card slot-card ${drag?.from === i ? 'dragging' : ''}`} key={s.slotId} ref={(el) => { cards.current[i] = el; }}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, ...(drag && drag.over === i && drag.from !== i ? { outline: '2px solid var(--accent)' } : {}) }}>
              <div className="row spread">
                <span className="row">
                  <span className="drag" role="button" aria-label="Drag to reorder" title="Drag to reorder"
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ from: i, over: i }); }}
                    onPointerMove={(e) => drag && setDrag({ from: drag.from, over: overIndex(e.clientY) })}
                    onPointerUp={() => { if (drag && drag.over !== drag.from) save(moveSlotTo(slots, drag.from, drag.over)); setDrag(null); }}
                    onPointerCancel={() => setDrag(null)}>⠿</span>
                  <span className="badge soft">Group {s.group}{paired ? ' · superset' : ''}</span>
                </span>
                <span className="row">
                  <button className="btn secondary small" aria-label="Move up" disabled={i === 0} onClick={() => save(moveSlot(slots, i, -1))}>↑</button>
                  <button className="btn secondary small" aria-label="Move down" disabled={i === slots.length - 1} onClick={() => save(moveSlot(slots, i, 1))}>↓</button>
                  <button className="btn secondary small" aria-label="Remove" onClick={() => window.confirm(`Remove ${ex?.name ?? 'this exercise'} from ${day.name}?`) && save(removeSlot(slots, i))}>✕</button>
                </span>
              </div>
              <button className="btn secondary" style={{ textAlign: 'left', fontSize: 17 }} aria-label="Change exercise" onClick={() => setPicking({ mode: 'change', index: i })}>
                {ex?.name ?? s.exerciseId} <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{ex ? EQUIPMENT_LABELS[ex.equipment] : ''} · change</span>
              </button>
              <div className="row">
                <label className="grow muted" style={{ fontSize: 12 }}>Sets<NumField label="Sets" integer min={1} value={s.sets} onCommit={(v) => save(updateSlot(slots, i, { sets: v }))} /></label>
                <label className="grow muted" style={{ fontSize: 12 }}>Min reps<NumField label="Min reps" integer min={1} value={s.repMin} onCommit={(v) => save(updateSlot(slots, i, { repMin: v }))} /></label>
                <label className="grow muted" style={{ fontSize: 12 }}>Max reps<NumField label="Max reps" integer min={1} value={s.repMax} onCommit={(v) => save(updateSlot(slots, i, { repMax: v }))} /></label>
              </div>
              <label className="muted" style={{ fontSize: 12 }}>Progression
                <select className="num" aria-label="Progression style" value={s.progressionStyle} onChange={(e) => save(updateSlot(slots, i, { progressionStyle: e.target.value as ProgressionStyle }))}>
                  {(Object.keys(PROGRESSION_LABELS) as ProgressionStyle[]).map((p) => <option key={p} value={p}>{PROGRESSION_LABELS[p]}{p === 'estimatedMax' ? ' — weight from your estimated max' : ' — add reps, then weight'}</option>)}
                </select>
              </label>
              <div className="row">
                {i > 0 && slots[i - 1].group !== s.group && <button className="btn secondary small grow" onClick={() => save(pairWithPrevious(slots, i))}>Pair with previous</button>}
                {paired && <button className="btn secondary small grow" onClick={() => save(unpair(slots, i))}>Unpair</button>}
              </div>
            </div>
          );
        })}
        <div className="row">
          <button className="btn primary grow" onClick={() => setPicking({ mode: 'add' })}>＋ Add exercise</button>
          <button className="btn secondary" onClick={() => setCreating(true)}>New custom…</button>
        </div>
      </fieldset>
      <p className="muted" style={{ fontSize: 13 }}>Neighbouring exercises in the same group alternate sets as a superset. Changing a slot’s exercise, rep range or progression resets its prescription (it’s worked out again from your e1RM, or predicted or calibrated).</p>

      {picking && (
        <Sheet onClose={() => setPicking(null)}>
          <h2>{picking.mode === 'add' ? 'Add an exercise' : 'Change exercise'}</h2>
          <ExerciseBrowser snap={snap} autoFocus onPick={(e) => pick(e.id)} />
        </Sheet>
      )}
      {creating && <ExerciseForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); setPicking({ mode: 'add' }); void id; }} />}
    </div>
  );
}
