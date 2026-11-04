import { formatNumber } from '../engine';
import type { Snapshot } from '../db/service';
import type { SessionRow } from '../db/schema';
import { KindBadge } from './components';

export function Summary({ snap, session, onDone }: { snap: Snapshot; session: SessionRow; onDone: () => void }) {
  const unit = snap.settings.units;
  const s = session.summary;
  if (!s) return null;
  return (
    <div className="page">
      <h1 className="big-title">Workout done 💪</h1>
      <div className="muted">
        Day {session.dayId} · {s.totalSets} sets{session.endedEarly ? ' · ended early' : ''}
        {s.returnSessionNumber ? ` · return phase session ${s.returnSessionNumber} of 12` : ''}
      </div>

      {s.stronger.map((c) => (
        <div className="card strong" key={c.exerciseId}>
          <div className="row spread">
            <div>
              <h2>You’re getting stronger!</h2>
              <div style={{ marginTop: 6 }}>
                <b>{snap.exercises[c.exerciseId].name}</b>
                <div className="muted">New estimated one-rep max: {formatNumber(c.oldE1rm, 1)} → {formatNumber(c.newE1rm, 1)} {unit}</div>
              </div>
            </div>
            <span className="pill">+{formatNumber(c.delta, 1)} ↑</span>
          </div>
        </div>
      ))}

      {s.deloaded.map((id) => (
        <div className="explainer" key={id}>Two sessions in a row came in below your trend, so {snap.exercises[id].name} drops to a deload weight next time.</div>
      ))}

      <div className="card">
        <h2 style={{ marginBottom: 6 }}>Next time</h2>
        {s.items.map((it) => (
          <div className="ex-row" key={it.slotId}>
            <div style={{ flex: 1 }}>
              <div className="name">{snap.exercises[it.exerciseId].name}</div>
              <div className="sub">{it.reason}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="w">{it.nextWeight != null ? `${formatNumber(it.nextWeight)} ${unit}` : '—'}</div>
              <KindBadge kind={it.kind} />
            </div>
          </div>
        ))}
      </div>
      <button className="btn primary block" onClick={onDone}>Done</button>
    </div>
  );
}
