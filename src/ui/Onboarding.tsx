import { useState } from 'react';
import { db } from '../db/db';
import { applyOnboarding, skipOnboarding, type SeedEntry } from '../db/service';
import type { Snapshot } from '../db/service';
import type { TimeAgo } from '../engine';

const AGO: { v: TimeAgo; label: string }[] = [
  { v: 'under-1', label: 'Under 1 month' },
  { v: '1-3', label: '1–3 months' },
  { v: '3-6', label: '3–6 months' },
  { v: '6-plus', label: '6+ months' },
];

export function Onboarding({ snap, onDone }: { snap: Snapshot; onDone: () => void }) {
  const unit = snap.settings.units;
  const ids = [...new Set(snap.activeDays.flatMap((d) => d.slots.map((s) => s.exerciseId)))];
  const [bw, setBw] = useState(snap.settings.bodyweight != null ? String(snap.settings.bodyweight) : '');
  const [returning, setReturning] = useState(snap.settings.returnPhase.active);
  const [rows, setRows] = useState<Record<string, { w: string; r: string; ago: TimeAgo }>>(
    Object.fromEntries(ids.map((id) => [id, { w: '', r: '', ago: '6-plus' as TimeAgo }])),
  );
  const patch = (id: string, p: Partial<{ w: string; r: string; ago: TimeAgo }>) => setRows({ ...rows, [id]: { ...rows[id], ...p } });
  const num = (s: string) => parseFloat(s.replace(',', '.'));

  async function save() {
    const entries: SeedEntry[] = ids
      .map((id) => ({ exerciseId: id, weight: num(rows[id].w), reps: num(rows[id].r), ago: rows[id].ago }))
      .filter((e) => Number.isFinite(e.weight) && e.reps > 0);
    await applyOnboarding(db, { bodyweight: num(bw) > 0 ? num(bw) : null, returningAfterBreak: returning, entries });
    onDone();
  }

  return (
    <div className="page">
      <h1 className="big-title">Welcome</h1>
      <p className="muted" style={{ margin: 0 }}>Tell Lift what you remember lifting. Everything here is optional — anything you skip is worked out from your first sets.</p>

      <div className="card">
        <label className="muted" htmlFor="ob-bw">Bodyweight ({unit})</label>
        <input id="ob-bw" className="num" inputMode="decimal" value={bw} onChange={(e) => setBw(e.target.value)} placeholder="Needed for pull-ups" />
        <label className="switch" style={{ marginTop: 8 }}>Haven’t trained regularly for 3+ months
          <input type="checkbox" checked={returning} onChange={(e) => setReturning(e.target.checked)} />
        </label>
        <div className="muted" style={{ fontSize: 13 }}>Turns on the 12-session return phase: lighter targets and one set fewer on main lifts at first.</div>
      </div>

      {ids.map((id) => {
        const ex = snap.exercises[id];
        const r = rows[id];
        return (
          <div className="card" key={id}>
            <b>{ex.name}</b>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{ex.equipment === 'bodyweight' ? `Added load (negative = assistance)${num(bw) > 0 ? '' : ' — enter your bodyweight above or this is ignored'}` : ex.equipment === 'dumbbell' ? 'Weight per dumbbell' : 'A set you remember'}</div>
            <div className="row">
              <input className="num" inputMode="decimal" placeholder={unit} aria-label={`${ex.name} weight`} value={r.w} onChange={(e) => patch(id, { w: e.target.value })} />
              <span>×</span>
              <input className="num" inputMode="numeric" placeholder="reps" aria-label={`${ex.name} reps`} value={r.r} onChange={(e) => patch(id, { r: e.target.value })} />
            </div>
            <select className="num" style={{ marginTop: 8 }} aria-label={`${ex.name} how long ago`} value={r.ago} onChange={(e) => patch(id, { ago: e.target.value as TimeAgo })}>
              {AGO.map((a) => <option key={a.v} value={a.v}>{a.label} ago</option>)}
            </select>
          </div>
        );
      })}
      <button className="btn primary block" onClick={save}>Save and continue</button>
      <button className="btn secondary block" onClick={async () => { await skipOnboarding(db); onDone(); }}>Skip for now</button>
    </div>
  );
}
