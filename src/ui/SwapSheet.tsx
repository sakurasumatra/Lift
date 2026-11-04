import { useState } from 'react';
import { db } from '../db/db';
import { makeSwapPermanent } from '../db/service';
import type { Snapshot } from '../db/service';
import type { SessionRow } from '../db/schema';
import { EQUIPMENT_LABELS, filterExercises, formatNumber, type ExerciseDef, type SlotDef } from '../engine';
import { KindBadge, Sheet } from './components';
import { slotPrescription } from './prescriptions';

const MAX_SEARCH_RESULTS = 12;

/**
 * "Replace" on the workout screen. Same-family alternatives come first, each with its prescribed weight already
 * worked out (its own state, else a prediction, else a calibration set). Below them, "All exercises" searches the
 * whole library, so any exercise can be swapped in. A swap lasts for this session unless made permanent.
 */
export function SwapSheet({ snap, session, slot, currentId, onClose }: {
  snap: Snapshot; session: SessionRow; slot: SlotDef; currentId: string; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const unit = snap.settings.units;
  const current = snap.exercises[currentId];
  const all = Object.values(snap.exercises);

  // The slot's own exercise is offered as a way back when something else is swapped in.
  const family = all
    .filter((e) => !e.hidden && current.family && e.family === current.family && e.id !== currentId)
    .concat(currentId !== slot.exerciseId ? [snap.exercises[slot.exerciseId]] : [])
    .filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i)
    .sort((a, b) => a.name.localeCompare(b.name));
  const shown = new Set([currentId, ...family.map((e) => e.id)]);
  const results = text.trim()
    ? filterExercises(all, { text, muscle: '', equipment: '' }).filter((e) => !shown.has(e.id)).slice(0, MAX_SEARCH_RESULTS)
    : [];

  const card = (alt: ExerciseDef) => {
    // Swapping back to the slot's own exercise shows its slot state, i.e. what will actually load.
    const p = slotPrescription(snap, slot, alt.id);
    const apply = async (permanent: boolean) => {
      if (permanent) {
        await makeSwapPermanent(db, session.id, slot.slotId, alt.id);
      } else {
        const swaps = session.swaps.filter((s) => s.slotId !== slot.slotId);
        if (alt.id !== slot.exerciseId) swaps.push({ slotId: slot.slotId, fromExerciseId: slot.exerciseId, toExerciseId: alt.id });
        await db.sessions.update(session.id, { swaps });
      }
      onClose();
    };
    return (
      <div className="alt" key={alt.id}>
        <div className="top">
          <span><b>{alt.name}</b><span className="muted" style={{ display: 'block', fontSize: 12 }}>{EQUIPMENT_LABELS[alt.equipment]}</span></span>
          <span className="w">{p.weight != null ? `${alt.equipment === 'bodyweight' && p.weight > 0 ? '+' : ''}${formatNumber(p.weight)} ${unit}` : 'Enter weight'}</span>
        </div>
        <div className="row">
          <KindBadge kind={p.kind} />
          <span className="muted" style={{ fontSize: 13 }}>
            {p.kind === 'normal' ? 'From its own history' : p.kind === 'predicted' ? 'Predicted from a related lift' : p.kind === 'deload' ? 'Deload' : 'No data yet: you’ll calibrate it'}
          </span>
        </div>
        <div className="row">
          <button className="btn secondary small grow" onClick={() => apply(false)}>Swap for today</button>
          <button className="btn secondary small grow" onClick={() => apply(true)}>Make permanent</button>
        </div>
      </div>
    );
  };

  return (
    <Sheet onClose={onClose}>
      <h2>Replace {current.name}</h2>
      <p className="muted" style={{ margin: 0 }}>Logs go to the exercise you pick.</p>
      <h3 style={{ fontSize: 15 }}>Same movement</h3>
      {family.length === 0 && <div className="muted">{current.family ? 'No other exercises in this family.' : 'This exercise has no movement family, so nothing is directly related.'}</div>}
      {family.map(card)}
      <h3 style={{ fontSize: 15 }}>All exercises</h3>
      <input className="text" type="search" aria-label="Search all exercises" placeholder="Search the whole library" value={text} onChange={(e) => setText(e.target.value)} />
      {text.trim() && results.length === 0 && <div className="muted">No other exercises match.</div>}
      {results.map(card)}
    </Sheet>
  );
}
