import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FAMILY_LABELS, rpeToRir, type ExerciseDef, type FamilyId, type PrescriptionKind, type ReturnPhase } from '../engine';
import { KIND_LABEL, imageUrl } from './prescriptions';

export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function KindBadge({ kind, onClick }: { kind: PrescriptionKind; onClick?: () => void }) {
  if (kind === 'normal') return null;
  return (
    <button className="badge" onClick={onClick} aria-label={`${KIND_LABEL[kind]} — what's this?`}>
      {KIND_LABEL[kind]} ⓘ
    </button>
  );
}

export function ReturnBanner({ rp }: { rp: ReturnPhase }) {
  if (!rp.active) return null;
  return <div className="banner">Return phase · session {rp.sessionsCompleted + 1} of 12</div>;
}

export function ExerciseImage({ exercise }: { exercise: ExerciseDef }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [exercise.id]);
  return (
    <div className="img">
      {failed ? (
        <div className="ph">{FAMILY_LABELS[exercise.family as FamilyId]}</div>
      ) : (
        <img src={imageUrl(exercise.id)} alt={`${exercise.name} demonstration`} onError={() => setFailed(true)} />
      )}
    </div>
  );
}

const RPE_COLORS: Record<number, string> = { 6: 'var(--rpe6)', 7: 'var(--rpe7)', 8: 'var(--rpe8)', 9: 'var(--rpe9)', 10: 'var(--rpe10)' };
const RIR_LABEL = ['Couldn’t have done another rep', 'Could have done 1 more rep', 'Could have done 2 more reps', 'Could have done 3 more reps', 'Could have done 4+ more reps'];

export function RpePicker({ initial, required, onPick, onClose }: { initial?: number | null; required: boolean; onPick: (rpe: number | null) => void; onClose: () => void }) {
  const [sel, setSel] = useState<number | null>(initial ?? null);
  return (
    <Sheet onClose={onClose}>
      <h2>How hard was that set?</h2>
      <div className="rpe">
        {[6, 7, 8, 9, 10].map((n) => (
          <button key={n} className={sel === n ? 'sel' : ''} onClick={() => setSel(n)} aria-pressed={sel === n}>
            {n}
            <i style={{ background: RPE_COLORS[n] }} />
          </button>
        ))}
      </div>
      <div className="rpe-label">{sel != null ? RIR_LABEL[rpeToRir(sel)] : required ? 'Pick how close to failure you were' : 'Optional — you can skip this'}</div>
      <button className="btn primary block" disabled={required && sel == null} onClick={() => onPick(sel)}>
        Save set
      </button>
      {!required && (
        <button className="btn secondary block" onClick={() => onPick(null)}>
          Skip
        </button>
      )}
    </Sheet>
  );
}

export function Stepper({ title, value, step, min, unit, onChange, onClose }: { title: string; value: number; step: number; min?: number; unit?: string; onChange: (v: number) => void; onClose: () => void }) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState(String(value));
  const timer = useRef<number | undefined>(undefined);
  const clampMin = (v: number) => (min != null ? Math.max(min, v) : v);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const startPress = () => { timer.current = window.setTimeout(() => { setText(String(value)); setTyping(true); }, 450); };
  const endPress = () => window.clearTimeout(timer.current);
  const commit = () => {
    const n = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(n)) onChange(clampMin(round(n)));
    setTyping(false);
  };
  return (
    <Sheet onClose={onClose}>
      <h2>{title}</h2>
      <div className="stepper">
        <button onClick={() => onChange(clampMin(round(value - step)))} aria-label="Decrease">−</button>
        {typing ? (
          <input autoFocus inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
        ) : (
          <div className="val" onPointerDown={startPress} onPointerUp={endPress} onPointerLeave={endPress} onContextMenu={(e) => e.preventDefault()}>
            {round(value)}
          </div>
        )}
        <button onClick={() => onChange(clampMin(round(value + step)))} aria-label="Increase">+</button>
      </div>
      <div className="muted" style={{ textAlign: 'center' }}>{unit} · step {step} · hold the number to type</div>
      <button className="btn primary block" onClick={() => (typing ? commit() : onClose())}>OK</button>
    </Sheet>
  );
}
