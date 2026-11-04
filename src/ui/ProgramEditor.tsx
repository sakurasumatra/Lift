import { useState } from 'react';
import { db } from '../db/db';
import type { Snapshot } from '../db/service';
import { saveProgramDay, updateExercise } from '../db/settingsService';
import { addSlot, moveSlot, pairWithPrevious, removeSlot, unpair, updateSlot, type Equipment, type ExerciseType } from '../engine';
import { NumField, SubHeader } from './fields';
import { useActiveSession } from './hooks';

const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];

export function ProgramEditor({ snap, onBack }: { snap: Snapshot; onBack: () => void }) {
  const [dayId, setDayId] = useState(snap.days[0].id);
  const [adding, setAdding] = useState('');
  const active = useActiveSession();
  const day = snap.days.find((d) => d.id === dayId)!;
  const slots = day.slots;
  const save = (next: typeof slots) => saveProgramDay(db, dayId, next);
  const all = Object.values(snap.exercises).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page">
      <SubHeader title="Program" onBack={onBack} />
      {active && <div className="explainer">A workout is in progress. Finish it before editing the program.</div>}
      <div className="row">
        {snap.days.map((d) => (
          <button key={d.id} className={`btn small ${d.id === dayId ? 'primary' : 'secondary'}`} onClick={() => setDayId(d.id)}>Day {d.label}</button>
        ))}
      </div>
      <fieldset disabled={!!active} style={{ border: 0, padding: 0, margin: 0, display: 'contents' }}>
        {slots.map((s, i) => {
          const ex = snap.exercises[s.exerciseId];
          const paired = (i > 0 && slots[i - 1].group === s.group) || (i < slots.length - 1 && slots[i + 1].group === s.group);
          return (
            <div className="card" key={s.slotId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row spread">
                <span className="badge soft">Group {s.group}{paired ? ' · superset' : ''}</span>
                <span className="row">
                  <button className="btn secondary small" aria-label="Move up" disabled={i === 0} onClick={() => save(moveSlot(slots, i, -1))}>↑</button>
                  <button className="btn secondary small" aria-label="Move down" disabled={i === slots.length - 1} onClick={() => save(moveSlot(slots, i, 1))}>↓</button>
                  <button className="btn secondary small" aria-label="Remove" onClick={() => window.confirm(`Remove ${ex.name} from day ${day.label}?`) && save(removeSlot(slots, i))}>✕</button>
                </span>
              </div>
              <select className="num" aria-label="Exercise" value={s.exerciseId} onChange={(e) => save(updateSlot(slots, i, { exerciseId: e.target.value }))}>
                {all.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <div className="row">
                <label className="grow muted" style={{ fontSize: 12 }}>Sets<NumField label="Sets" integer min={1} value={s.sets} onCommit={(v) => save(updateSlot(slots, i, { sets: v }))} /></label>
                <label className="grow muted" style={{ fontSize: 12 }}>Min reps<NumField label="Min reps" integer min={1} value={s.repMin} onCommit={(v) => save(updateSlot(slots, i, { repMin: v }))} /></label>
                <label className="grow muted" style={{ fontSize: 12 }}>Max reps<NumField label="Max reps" integer min={1} value={s.repMax} onCommit={(v) => save(updateSlot(slots, i, { repMax: v }))} /></label>
              </div>
              <div className="row">
                <select className="num" aria-label="Type" value={ex.type} onChange={(e) => updateExercise(db, ex.id, { type: e.target.value as ExerciseType })}>
                  <option value="main">Main lift</option><option value="accessory">Accessory</option>
                </select>
                <select className="num" aria-label="Equipment" value={ex.equipment} onChange={(e) => updateExercise(db, ex.id, { equipment: e.target.value as Equipment })}>
                  {EQUIPMENT.map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
              <div className="row">
                {i > 0 && slots[i - 1].group !== s.group && <button className="btn secondary small grow" onClick={() => save(pairWithPrevious(slots, i))}>Pair with previous</button>}
                {paired && <button className="btn secondary small grow" onClick={() => save(unpair(slots, i))}>Unpair</button>}
              </div>
            </div>
          );
        })}
        <div className="card" style={{ display: 'flex', gap: 8 }}>
          <select className="num" aria-label="Exercise to add" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Add an exercise…</option>
            {all.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button className="btn primary small" disabled={!adding} onClick={() => { save(addSlot(dayId, slots, adding)); setAdding(''); }}>Add</button>
        </div>
      </fieldset>
      <p className="muted" style={{ fontSize: 13 }}>Neighbouring exercises in the same group alternate sets as a superset. Changing a slot’s exercise or rep range resets its prescription (it’s worked out again from your e1RM, or predicted or calibrated).</p>
    </div>
  );
}
