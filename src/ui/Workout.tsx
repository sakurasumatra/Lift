import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../db/db';
import { discardSession, finishSession, saveSet, setRowId } from '../db/service';
import type { Snapshot } from '../db/service';
import type { SessionRow, SetRow } from '../db/schema';
import {
  BAR_WEIGHT, buildQueue, checkGettingStronger, explainerFor, formatNumber, isMaxStyle, plateBreakdown, targetsFor, type SlotDef,
} from '../engine';
import { CUES } from '../data/cues';
import { ExerciseImage, KindBadge, ReturnBanner, RpePicker, Sheet, Stepper } from './components';
import { RestTimer, loadRest, primeAudio, saveRest, type RestState } from './RestTimer';
import { plannedSets, setDefaults, slotPrescription } from './prescriptions';
import { useSessionSets } from './hooks';
import { SwapSheet } from './SwapSheet';

interface Props { snap: Snapshot; session: SessionRow; onExit: () => void; onFinished: (sessionId: string) => void; }
type SheetName = null | 'info' | 'swap' | 'explain' | 'reorder' | 'menu';

export function Workout({ snap, session, onExit, onFinished }: Props) {
  const { settings, exercises } = snap;
  const unit = settings.units;
  const sets = useSessionSets(session.id);
  const day = snap.days.find((d) => d.id === session.dayId)!;

  const [view, setView] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [stepper, setStepper] = useState<null | 'weight' | 'reps'>(null);
  const [pendingRpe, setPendingRpe] = useState<null | { weight: number; reps: number }>(null);
  const [draft, setDraft] = useState<{ key: string; weight?: number; reps?: number } | null>(null);
  const [rest, setRest] = useState<RestState | null>(loadRest);
  const [toast, setToast] = useState<string | null>(null);
  const [bwInput, setBwInput] = useState('');
  const shownStronger = useRef(new Set<string>());
  const touch = useRef<number | null>(null);

  const updateRest = (r: RestState | null) => { setRest(r); saveRest(r); };
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3500); };

  // Keep the screen awake while working out (Screen Wake Lock API, where supported).
  useEffect(() => {
    if (!settings.keepScreenAwake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const get = async () => { try { lock = await navigator.wakeLock.request('screen'); } catch { /* denied */ } };
    get();
    const onVis = () => document.visibilityState === 'visible' && get();
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}); };
  }, [settings.keepScreenAwake]);

  const exerciseOf = (slot: SlotDef) => session.swaps.find((s) => s.slotId === slot.slotId)?.toExerciseId ?? slot.exerciseId;
  const skipped = session.skippedSlotIds ?? [];

  const loggedBy = useMemo(() => {
    const m = new Map<string, SetRow>();
    for (const s of sets) m.set(`${s.slotId}:${s.setIndex}`, s);
    return m;
  }, [sets]);

  const queue = useMemo(() => {
    const slots = day.slots
      .map((slot) => {
        const logged = sets.filter((s) => s.slotId === slot.slotId).length;
        const n = skipped.includes(slot.slotId) ? logged : plannedSets(snap, slot);
        return { slotId: slot.slotId, group: slot.group, sets: n, isMain: isMaxStyle(slot) };
      })
      .filter((s) => s.sets > 0);
    return buildQueue(slots, settings.restTimes, session.groupOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, session.swaps, session.skippedSlotIds, session.groupOrder, sets.length, snap]);

  const doneCount = queue.filter((q) => loggedBy.has(`${q.slotId}:${q.setIndex}`)).length;
  const currentIdx = queue.findIndex((q) => !loggedBy.has(`${q.slotId}:${q.setIndex}`));
  const allDone = queue.length > 0 && currentIdx === -1;
  const idx = Math.min(view ?? (allDone ? queue.length - 1 : currentIdx), queue.length - 1);
  const item = queue[idx];

  if (!item) {
    return (
      <div className="page">
        <p>Nothing left in this workout.</p>
        <button className="btn primary" onClick={() => finish(true)}>Finish</button>
      </div>
    );
  }

  const slot = day.slots.find((s) => s.slotId === item.slotId)!;
  const exId = exerciseOf(slot);
  const ex = exercises[exId];
  const rx = slotPrescription(snap, slot, exId);
  const targets = targetsFor(slot, settings.returnPhase);
  const logged = loggedBy.get(`${slot.slotId}:${item.setIndex}`);
  const slotSets = queue.filter((q) => q.slotId === slot.slotId);
  const grouped = day.slots.filter((s) => s.group === slot.group && !skipped.includes(s.slotId)).length > 1;

  // Defaults for this set: the prescription for set 1, otherwise the in-session suggestion from the previous set.
  const defaults = setDefaults(snap, slot, exId, item.setIndex, loggedBy.get(`${slot.slotId}:${item.setIndex - 1}`));
  const { weight: defWeight, kind: defKind, note } = defaults;
  const draftKey = `${idx}|${defWeight}|${slot.slotId}|${logged?.id ?? ''}`;
  const d = draft?.key === draftKey ? draft : null;
  const weight = logged ? (d?.weight ?? logged.weight) : (d?.weight ?? defWeight);
  const reps = logged ? (d?.reps ?? logged.reps) : (d?.reps ?? targets.targetReps);
  const kind = logged?.prescriptionKind ?? defKind;
  const setD = (patch: { weight?: number; reps?: number }) => setDraft({ ...(d ?? { key: draftKey }), key: draftKey, ...patch });

  const needsBodyweight = ex.equipment === 'bodyweight' && settings.bodyweight == null;

  async function commitSet(rpe: number | null) {
    const p = pendingRpe!;
    setPendingRpe(null);
    await saveSet(db, {
      sessionId: session.id, slotId: slot.slotId, exerciseId: exId, setIndex: item.setIndex,
      weight: p.weight, reps: p.reps, rpe, prescribedWeight: logged ? logged.prescribedWeight : defaults.prescribedWeight, prescriptionKind: kind,
      completedAt: logged?.completedAt,
    });
    setDraft(null);
    if (!logged) {
      // "You're getting stronger" — once per exercise per session, never on a first session.
      const before = sets.filter((s) => s.exerciseId === exId);
      const check = checkGettingStronger({
        exercise: ex, state: snap.exerciseStates[exId], setsSoFar: [...before, { weight: p.weight, reps: p.reps, rpe }], setsBefore: before,
        bodyweight: settings.bodyweight ?? 0,
        returnActive: settings.returnPhase.active, alreadyShown: shownStronger.current.has(exId),
      });
      if (check) {
        shownStronger.current.add(exId);
        showToast(`You’re getting stronger! ${ex.name} e1RM ${formatNumber(check.oldE1rm, 1)} → ${formatNumber(check.provisional, 1)} ${unit}`);
      }
      if (item.restAfter > 0) updateRest({ endsAt: Date.now() + item.restAfter * 1000, total: item.restAfter });
      setView(null);
    } else {
      setView(null);
    }
  }

  async function finish(early: boolean) {
    if (sets.length === 0) { await discardSession(db, session.id); saveRest(null); onExit(); return; }
    const done = await finishSession(db, session.id, early);
    saveRest(null);
    onFinished(done.id);
  }

  const next = queue.slice(idx + 1).find((q) => !loggedBy.has(`${q.slotId}:${q.setIndex}`));
  let nextLine: string | null = null;
  if (next && !logged) {
    const ns = day.slots.find((s) => s.slotId === next.slotId)!;
    const nid = exerciseOf(ns);
    // The weight the next set will be prefilled with (including any in-session suggestion).
    const nPrev = loggedBy.get(`${ns.slotId}:${next.setIndex - 1}`);
    // Straight sets: the next set follows this one, which isn't logged yet, so show this set's weight.
    const nw = !nPrev && next.setIndex > 0 && ns.slotId === slot.slotId
      ? weight
      : setDefaults(snap, ns, nid, next.setIndex, nPrev).prescribedWeight;
    const sign = exercises[nid].equipment === 'bodyweight' && nw != null && nw > 0 ? '+' : '';
    nextLine = `${exercises[nid].name}${nw != null ? ` · ${sign}${formatNumber(nw)} ${unit}` : ' · calibration'}`;
  }

  const plates = ex.equipment === 'barbell' && weight >= BAR_WEIGHT[unit] ? plateBreakdown(weight, unit) : null;
  const go = (to: number) => setView(Math.max(0, Math.min(queue.length - 1, to)));

  const swapAllowed = !sets.some((s) => s.slotId === slot.slotId);
  const remainingGroups = [...new Set(queue.filter((q) => !loggedBy.has(`${q.slotId}:${q.setIndex}`)).map((q) => q.group))];

  return (
    <div className="app">
      <div className="topbar">
        <button className="icon-btn" aria-label="Menu" onClick={() => setSheet(sheet === 'menu' ? null : 'menu')}>⋮</button>
        <h2>Workout</h2>
        <button className="btn small primary" onClick={() => (allDone ? finish(false) : window.confirm(`Finish now? ${queue.length - doneCount} sets left — this counts as ended early.`) && finish(true))}>Finish</button>
      </div>
      {sheet === 'menu' && (
        <div className="menu">
          <button onClick={async () => { setSheet(null); await db.sessions.update(session.id, { skippedSlotIds: [...skipped, slot.slotId] }); setView(null); }}>Skip this exercise</button>
          <button onClick={() => setSheet('reorder')}>Reorder exercises</button>
          <button onClick={() => { setSheet(null); if (window.confirm('End the workout early?')) finish(true); }}>End early</button>
          <button onClick={() => { setSheet(null); onExit(); }}>Back to home</button>
        </div>
      )}
      <div className="progress"><div style={{ width: `${(doneCount / queue.length) * 100}%` }} /></div>

      <div
        className="workout"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 80) go(idx + (dx < 0 ? 1 : -1));
        }}
      >
        <ReturnBanner rp={settings.returnPhase} />
        <div className="ex-head">
          <div className="row spread">
            <h1>{ex.name}</h1>
            <KindBadge kind={kind} onClick={() => setSheet('explain')} />
          </div>
          <div className="sets" aria-label="Sets">
            SET
            {slotSets.map((q) => {
              const isDone = loggedBy.has(`${q.slotId}:${q.setIndex}`);
              return <span key={q.setIndex} className={`n ${q.setIndex === item.setIndex ? 'cur' : ''} ${isDone ? 'done' : ''}`}>{isDone ? '✓' : q.setIndex + 1}</span>;
            })}
          </div>
          {grouped && <div className="group-label">Group {slot.group} · Superset</div>}
        </div>

        <ExerciseImage exercise={ex} />

        {kind === 'calibration' && !logged && item.setIndex === 0 && (
          <div className="explainer">{explainerFor('calibration')}</div>
        )}

        <div className="tiles">
          <div>
            <button className="tile" style={{ width: '100%' }} onClick={() => setStepper('weight')} aria-label="Edit weight">
              <span className="v">{ex.equipment === 'bodyweight' && weight > 0 ? '+' : ''}{formatNumber(weight)}</span>
              <span className="u">{unit}{ex.equipment === 'bodyweight' ? (weight < 0 ? ' assisted' : ' added') : ex.equipment === 'dumbbell' ? ' each' : ''}</span>
            </button>
            {plates && <div className="plates" style={{ textAlign: 'center' }}>Per side: {plates.perSide.length ? plates.perSide.join(' + ') : 'bar only'}{plates.remainder > 0 ? ` (+${formatNumber(plates.remainder)} left over)` : ''}</div>}
          </div>
          <span className="x">×</span>
          <button className="tile" onClick={() => setStepper('reps')} aria-label="Edit reps">
            <span className="v">{reps}</span>
            <span className="u">reps · target {slot.repMin}–{slot.repMax}</span>
          </button>
        </div>
        {note && !logged && <div className="note">{note}</div>}

        <div className="actions">
          <button className="tilebtn" onClick={() => setSheet('info')}><span>ⓘ</span>Info</button>
          <button className="tilebtn" disabled={!swapAllowed} style={{ opacity: swapAllowed ? 1 : 0.45 }} onClick={() => setSheet('swap')}><span>⇄</span>Replace</button>
          <button className="btn primary" onClick={() => { if (settings.timerSound) primeAudio(); setPendingRpe({ weight, reps }); }}>{logged ? 'Update' : 'Done'}</button>
        </div>

        {allDone && !logged ? null : nextLine && <div className="nextup"><span>Next up</span><b>{nextLine}</b></div>}
        {allDone && <button className="btn primary block" onClick={() => finish(false)}>Finish workout</button>}
        {idx !== currentIdx && !allDone && (
          <button className="btn secondary small" onClick={() => setView(null)}>Back to current set</button>
        )}
        {rest && <RestTimer rest={rest} sound={settings.timerSound} onChange={updateRest} />}
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}

      {stepper === 'weight' && (
        <Stepper title="Weight" value={weight} step={ex.increment} unit={unit} min={ex.equipment === 'bodyweight' ? undefined : 0} onChange={(v) => setD({ weight: v })} onClose={() => setStepper(null)} />
      )}
      {stepper === 'reps' && <Stepper title="Reps" value={reps} step={1} min={0} unit="reps" onChange={(v) => setD({ reps: v })} onClose={() => setStepper(null)} />}

      {pendingRpe && (
        <RpePicker initial={logged?.rpe} required={isMaxStyle(slot)} onPick={commitSet} onClose={() => setPendingRpe(null)} />
      )}

      {sheet === 'explain' && (
        <Sheet onClose={() => setSheet(null)}>
          <h2>{kind === 'predicted' ? 'Predicted set' : kind === 'deload' ? 'Deload' : 'Calibration set'}</h2>
          <div className="explainer">{kind === 'calibration' ? explainerFor('calibration') : rx.reason}</div>
          <button className="btn secondary block" onClick={() => setSheet(null)}>Got it</button>
        </Sheet>
      )}

      {sheet === 'info' && (
        <Sheet onClose={() => setSheet(null)}>
          <h2>{ex.name}</h2>
          {CUES[ex.id] ? <ul className="cues">{CUES[ex.id].map((c) => <li key={c}>{c}</li>)}</ul> : <div className="muted">No form cues for your own exercises.</div>}
          <div className="card" style={{ background: 'var(--tile)', boxShadow: 'none' }}>
            <b>Current e1RM:</b> {snap.exerciseStates[ex.id] ? `${formatNumber(snap.exerciseStates[ex.id].e1rm, 1)} ${unit}` : 'not yet known'}
            <div className="muted" style={{ marginTop: 6 }}>{rx.reason}</div>
          </div>
          <button className="btn secondary block" onClick={() => setSheet(null)}>Close</button>
        </Sheet>
      )}

      {sheet === 'swap' && <SwapSheet snap={snap} session={session} slot={slot} currentId={exId} onClose={() => setSheet(null)} />}

      {sheet === 'reorder' && (
        <Sheet onClose={() => setSheet(null)}>
          <h2>Reorder remaining</h2>
          {remainingGroups.map((g, i) => (
            <div className="alt" key={g}>
              <div className="top">
                <b>Group {g}: {day.slots.filter((s) => s.group === g).map((s) => exercises[exerciseOf(s)].name).join(' + ')}</b>
                <span className="row">
                  <button className="btn secondary small" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="btn secondary small" disabled={i === remainingGroups.length - 1} onClick={() => move(i, 1)}>↓</button>
                </span>
              </div>
            </div>
          ))}
          <button className="btn primary block" onClick={() => { setSheet(null); setView(null); }}>Done</button>
        </Sheet>
      )}

      {needsBodyweight && (
        <Sheet onClose={() => {}}>
          <h2>What’s your bodyweight?</h2>
          <p className="muted" style={{ margin: 0 }}>{ex.name} uses your bodyweight in its maths (assistance counts as negative added load).</p>
          <input className="num" inputMode="decimal" autoFocus placeholder={`Bodyweight in ${unit}`} value={bwInput} onChange={(e) => setBwInput(e.target.value)} />
          <button className="btn primary block" disabled={!(parseFloat(bwInput) > 0)} onClick={() => db.settings.update('main', { bodyweight: parseFloat(bwInput.replace(',', '.')) })}>Save</button>
          <button className="btn secondary block" onClick={() => { setSheet(null); db.sessions.update(session.id, { skippedSlotIds: [...skipped, slot.slotId] }); }}>Skip this exercise</button>
        </Sheet>
      )}
    </div>
  );

  async function move(i: number, dir: number) {
    const order = [...remainingGroups];
    const j = i + dir;
    [order[i], order[j]] = [order[j], order[i]];
    const finished = [...new Set(queue.filter((q) => loggedBy.has(`${q.slotId}:${q.setIndex}`)).map((q) => q.group))].filter((g) => !order.includes(g));
    await db.sessions.update(session.id, { groupOrder: [...finished, ...order] });
  }
}

export { setRowId };
