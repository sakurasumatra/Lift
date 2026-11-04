import { useState } from 'react';
import type { Snapshot } from '../db/service';
import { ExerciseBrowser } from './ExerciseBrowser';
import { ExerciseForm } from './ExerciseForm';

/** The Exercises tab: the whole library with search and filters, plus custom exercises. */
export function Library({ snap, onOpen }: { snap: Snapshot; onOpen: (id: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const anyHidden = Object.values(snap.exercises).some((e) => e.hidden);
  return (
    <div className="page">
      <div className="row spread">
        <h1 className="big-title">Exercises</h1>
        <button className="btn small primary" onClick={() => setCreating(true)}>＋ New</button>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ExerciseBrowser snap={snap} showHidden={showHidden} onPick={(e) => onOpen(e.id)}
          trailing={(e) => (e.hidden ? <span className="badge soft">Hidden</span> : <span className="muted">›</span>)} />
      </div>
      {anyHidden && (
        <label className="switch">Show hidden exercises
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
        </label>
      )}
      {creating && <ExerciseForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); onOpen(id); }} />}
    </div>
  );
}
