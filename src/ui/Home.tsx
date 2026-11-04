import { useState } from 'react';
import { db } from '../db/db';
import { nextDayId, startSession } from '../db/service';
import type { Snapshot } from '../db/service';
import type { SessionRow } from '../db/schema';
import { formatNumber, isMaxStyle } from '../engine';
import { useLiveQuery } from 'dexie-react-hooks';
import { KindBadge, ReturnBanner } from './components';
import { dayBadge } from './days';
import { plannedSets, slotPrescription } from './prescriptions';

export function Home({ snap, active, onStart, onOpenPrograms }: { snap: Snapshot; active: SessionRow | null; onStart: () => void; onOpenPrograms: () => void }) {
  const info = useLiveQuery(async () => {
    const finished = (await db.sessions.where('finishedAt').above(0).sortBy('finishedAt')).pop();
    return { next: await nextDayId(db), last: finished?.finishedAt ?? null };
  }, []);
  const [busy, setBusy] = useState(false);
  const dayId = active?.dayId ?? info?.next ?? snap.activeDays[0]?.id;
  const day = snap.days.find((d) => d.id === dayId);
  const unit = snap.settings.units;

  if (!active && (!snap.activeProgram || snap.activeDays.length === 0)) {
    return (
      <div className="page">
        <h1 className="big-title">Lift</h1>
        <ReturnBanner rp={snap.settings.returnPhase} />
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>Create your first program</h2>
          <p className="muted" style={{ margin: 0 }}>Build one from scratch with any exercises you like, or start from the 3-day full-body template.</p>
          <button className="btn primary block" onClick={onOpenPrograms}>Create a program</button>
        </div>
      </div>
    );
  }
  if (!day) {
    // An unfinished workout whose day is gone: let the user open it to close it out.
    return active ? (
      <div className="page">
        <h1 className="big-title">Lift</h1>
        <button className="btn primary block" onClick={onStart}>Resume workout</button>
      </div>
    ) : null;
  }
  const empty = day.slots.length === 0;

  return (
    <div className="page">
      <h1 className="big-title">Lift</h1>
      <ReturnBanner rp={snap.settings.returnPhase} />
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="day-badge">{dayBadge(day.name)}</div>
          <div>
            <h2>{active ? 'Workout in progress' : 'Up next'} · {day.name}</h2>
            <div className="muted">{info?.last ? `Last session ${new Date(info.last).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'No sessions yet'}</div>
          </div>
        </div>
        {empty && (
          <div className="explainer" style={{ marginTop: 8 }}>
            {day.name} has no exercises yet.
            <button className="btn small secondary" style={{ marginLeft: 8 }} onClick={onOpenPrograms}>Add exercises</button>
          </div>
        )}
        {day.slots.map((slot) => {
          const exId = active?.swaps.find((s) => s.slotId === slot.slotId)?.toExerciseId ?? slot.exerciseId;
          const ex = snap.exercises[exId];
          const rx = slotPrescription(snap, slot, exId);
          return (
            <div className="ex-row" key={slot.slotId}>
              <div>
                <div className="name">{ex.name}</div>
                <div className="sub">{plannedSets(snap, slot)} × {slot.repMin}–{slot.repMax}{isMaxStyle(slot) ? ' · main' : ''}</div>
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
        disabled={busy || empty}
        onClick={async () => { setBusy(true); await startSession(db, dayId); setBusy(false); onStart(); }}
      >
        {active ? 'Resume workout' : 'Start workout'}
      </button>
    </div>
  );
}
