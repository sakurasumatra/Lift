import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Snapshot } from '../db/service';
import { e1rmSeries, bestSets, formatNumber } from '../engine';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import { ExerciseImage } from './components';

const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function HistoryList({ snap, onOpen }: { snap: Snapshot; onOpen: (sessionId: string) => void }) {
  const sessions = useLiveQuery(async () => (await db.sessions.where('finishedAt').above(0).reverse().sortBy('finishedAt')), []);
  return (
    <div className="page">
      <h1 className="big-title">History</h1>
      {sessions?.length === 0 && <div className="card muted">No finished workouts yet.</div>}
      {sessions?.map((s) => (
        <button className="card row spread" style={{ textAlign: 'left' }} key={s.id} onClick={() => onOpen(s.id)}>
          <div className="row">
            <div className="day-badge" style={{ width: 44, height: 44, fontSize: 24 }}>{s.dayId}</div>
            <div>
              <b>{fmtDate(s.finishedAt!)}</b>
              <div className="muted" style={{ fontSize: 13 }}>{s.summary?.totalSets ?? 0} sets{s.endedEarly ? ' · ended early' : ''}</div>
            </div>
          </div>
          <span className="muted">›</span>
        </button>
      ))}
      <span hidden>{snap.settings.units}</span>
    </div>
  );
}

export function SessionDetail({ snap, sessionId, onBack, onExercise }: { snap: Snapshot; sessionId: string; onBack: () => void; onExercise: (id: string) => void }) {
  const data = useLiveQuery(async () => ({
    session: await db.sessions.get(sessionId),
    sets: (await db.sets.where('sessionId').equals(sessionId).toArray()).sort((a, b) => a.completedAt - b.completedAt),
  }), [sessionId]);
  if (!data?.session) return null;
  const unit = snap.settings.units;
  const order: string[] = [];
  for (const s of data.sets) if (!order.includes(s.exerciseId)) order.push(s.exerciseId);
  return (
    <div className="page">
      <div className="row"><button className="icon-btn" aria-label="Back" onClick={onBack}>←</button><h1>Day {data.session.dayId}</h1></div>
      <div className="muted">{data.session.finishedAt ? fmtDate(data.session.finishedAt) : 'In progress'}{data.session.endedEarly ? ' · ended early' : ''}</div>
      {data.session.summary?.stronger.map((c) => (
        <div className="card strong row spread" key={c.exerciseId}>
          <div><b>You’re getting stronger!</b><div className="muted">{snap.exercises[c.exerciseId].name}: {formatNumber(c.oldE1rm, 1)} → {formatNumber(c.newE1rm, 1)} {unit}</div></div>
          <span className="pill">+{formatNumber(c.delta, 1)} ↑</span>
        </div>
      ))}
      {order.map((id) => (
        <div className="card" key={id}>
          <button onClick={() => onExercise(id)} style={{ fontWeight: 900, fontSize: 18, textAlign: 'left' }}>{snap.exercises[id].name} ›</button>
          {data.sets.filter((s) => s.exerciseId === id).map((s) => (
            <div className="ex-row" key={s.id}>
              <span className="muted">Set {s.setIndex + 1}</span>
              <b>{formatNumber(s.weight)} {unit} × {s.reps}</b>
              <span className="muted">{s.rpe != null ? `RPE ${s.rpe}` : '—'}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ExerciseList({ snap, onOpen }: { snap: Snapshot; onOpen: (id: string) => void }) {
  const list = Object.values(snap.exercises).filter((e) => snap.exerciseStates[e.id]).sort((a, b) => a.name.localeCompare(b.name));
  const rest = Object.values(snap.exercises).filter((e) => !snap.exerciseStates[e.id]).sort((a, b) => a.name.localeCompare(b.name));
  const unit = snap.settings.units;
  return (
    <div className="page">
      <h1 className="big-title">Exercises</h1>
      <div className="card">
        {list.length === 0 && <div className="muted">Exercises you’ve trained appear here with their e1RM.</div>}
        {list.map((e) => (
          <button className="ex-row" style={{ width: '100%', textAlign: 'left' }} key={e.id} onClick={() => onOpen(e.id)}>
            <span className="name">{e.name}</span><span className="w">{formatNumber(snap.exerciseStates[e.id].e1rm, 1)} {unit}</span>
          </button>
        ))}
      </div>
      {rest.length > 0 && (
        <div className="card">
          <div className="muted" style={{ marginBottom: 4 }}>No data yet</div>
          {rest.map((e) => (
            <button className="ex-row" style={{ width: '100%', textAlign: 'left' }} key={e.id} onClick={() => onOpen(e.id)}><span className="name">{e.name}</span><span className="muted">›</span></button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExerciseDetail({ snap, exerciseId, onBack }: { snap: Snapshot; exerciseId: string; onBack: () => void }) {
  const ex = snap.exercises[exerciseId];
  const state = snap.exerciseStates[exerciseId];
  const unit = snap.settings.units;
  const bw = snap.settings.bodyweight ?? 0;
  const hist = useLiveQuery(async () => {
    const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray();
    const sessions = await db.sessions.bulkGet([...new Set(sets.map((s) => s.sessionId))]);
    const at = new Map(sessions.filter(Boolean).map((s) => [s!.id, s!.finishedAt ?? s!.startedAt]));
    return sets.filter((s) => at.has(s.sessionId)).map((s) => ({ sessionId: s.sessionId, at: at.get(s.sessionId)!, weight: s.weight, reps: s.reps, rpe: s.rpe }));
  }, [exerciseId]) ?? [];
  const series = e1rmSeries(ex.equipment, hist, bw).map((p) => ({ date: new Date(p.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), e1rm: Math.round(p.e1rm * 10) / 10 }));
  const best = bestSets(ex.equipment, hist, bw, 5);
  return (
    <div className="page">
      <div className="row"><button className="icon-btn" aria-label="Back" onClick={onBack}>←</button><h1>{ex.name}</h1></div>
      <ExerciseImage exercise={ex} />
      <div className="card">
        <div className="muted">Current estimated one-rep max</div>
        <div style={{ fontSize: 44, fontWeight: 900 }}>{state ? `${formatNumber(state.e1rm, 1)} ${unit}` : '—'}</div>
        {state && <div className="muted" style={{ fontSize: 13 }}>{state.sessionCount} logged session{state.sessionCount === 1 ? '' : 's'} · misses in a row: {state.missCount}</div>}
        {!state && <div className="muted">No data yet — your first sets will set this.</div>}
      </div>
      <div className="card">
        <h2 style={{ marginBottom: 8 }}>e1RM over time</h2>
        {series.length < 2 ? <div className="muted">Log at least two sessions to see a chart.</div> : (
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={series} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <Tooltip formatter={(v) => `${v} ${unit}`} />
                {state && <ReferenceLine y={Math.round(state.e1rm * 10) / 10} stroke="var(--muted)" strokeDasharray="4 4" />}
                <Line type="monotone" dataKey="e1rm" name="Session e1RM" stroke="var(--accent)" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="muted" style={{ fontSize: 12 }}>Line: best set each session. Dashed: current smoothed estimate.</div>
      </div>
      <div className="card">
        <h2>Best sets</h2>
        {best.length === 0 && <div className="muted">Nothing logged yet.</div>}
        {best.map((s, i) => (
          <div className="ex-row" key={i}><b>{formatNumber(s.weight)} {unit} × {s.reps}</b><span className="muted">e1RM {formatNumber(s.e1rm, 1)}</span></div>
        ))}
      </div>
    </div>
  );
}
