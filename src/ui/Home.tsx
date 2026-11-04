import { useState } from 'react';
import { db } from '../db/db';
import { nextDayId, startSession } from '../db/service';
import type { Snapshot } from '../db/service';
import type { SessionRow } from '../db/schema';
import { formatNumber } from '../engine';
import { useLiveQuery } from 'dexie-react-hooks';
import { KindBadge, ReturnBanner } from './components';
import { plannedSets, slotPrescription } from './prescriptions';

export function Home({ snap, active, onStart }: { snap: Snapshot; active: SessionRow | null; onStart: () => void }) {
  const info = useLiveQuery(async () => {
    const finished = (await db.sessions.where('finishedAt').above(0).sortBy('finishedAt')).pop();
    return { next: await nextDayId(db), last: finished?.finishedAt ?? null };
  }, []);
  const [busy, setBusy] = useState(false);
  const dayId = active?.dayId ?? info?.next ?? 'A';
  const day = snap.days.find((d) => d.id === dayId);
  if (!day) return null;
  const unit = snap.settings.units;

  return (
    <div className="page">
      <h1 className="big-title">Lift</h1>
      <ReturnBanner rp={snap.settings.returnPhase} />
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="day-badge">{day.label}</div>
          <div>
            <h2>{active ? 'Workout in progress' : 'Up next'}</h2>
            <div className="muted">{info?.last ? `Last session ${new Date(info.last).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'No sessions yet'}</div>
          </div>
        </div>
        {day.slots.map((slot) => {
          const exId = active?.swaps.find((s) => s.slotId === slot.slotId)?.toExerciseId ?? slot.exerciseId;
          const ex = snap.exercises[exId];
          const rx = slotPrescription(snap, slot, exId);
          return (
            <div className="ex-row" key={slot.slotId}>
              <div>
                <div className="name">{ex.name}</div>
                <div className="sub">{plannedSets(snap, slot, exId)} × {slot.repMin}–{slot.repMax}{ex.type === 'main' ? ' · main' : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="w">{rx.weight != null ? `${ex.equipment === 'bodyweight' && rx.weight > 0 ? '+' : ''}${formatNumber(rx.weight)} ${unit}` : 'Calibrate'}</div>
                <KindBadge kind={rx.kind} />
              </div>
            </div>
          );
        })}
      </div>
      <button
        className="btn primary block"
        disabled={busy}
        onClick={async () => { setBusy(true); await startSession(db, dayId); setBusy(false); onStart(); }}
      >
        {active ? 'Resume workout' : 'Start workout'}
      </button>
    </div>
  );
}
