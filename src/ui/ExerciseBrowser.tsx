import { useMemo, useState, type ReactNode } from 'react';
import type { Snapshot } from '../db/service';
import { EQUIPMENT_LABELS, EQUIPMENT_LIST, MUSCLE_LABELS, MUSCLE_LIST, filterExercises, formatNumber, type Equipment, type ExerciseDef, type MuscleGroup } from '../engine';
import { imageUrl } from './prescriptions';

export function Thumb({ exercise }: { exercise: ExerciseDef }) {
  const [failed, setFailed] = useState(false);
  const none = failed || exercise.isCustom || !exercise.imageRef;
  return (
    <div className="thumb">
      {none ? <span>{exercise.name[0]}</span> : <img src={imageUrl(exercise.id)} alt="" loading="lazy" onError={() => setFailed(true)} />}
    </div>
  );
}

/**
 * Searchable exercise list with muscle and equipment filters. Each row shows the image and the current e1RM
 * when the exercise has one. `trailing` adds a per-row extra (for example a "Hidden" tag).
 */
export function ExerciseBrowser({ snap, onPick, showHidden = false, autoFocus = false, trailing }: {
  snap: Snapshot;
  onPick: (e: ExerciseDef) => void;
  showHidden?: boolean;
  autoFocus?: boolean;
  trailing?: (e: ExerciseDef) => ReactNode;
}) {
  const [text, setText] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | ''>('');
  const [equipment, setEquipment] = useState<Equipment | ''>('');
  const all = useMemo(() => Object.values(snap.exercises), [snap.exercises]);
  const rows = filterExercises(all, { text, muscle, equipment, showHidden });
  const unit = snap.settings.units;
  return (
    <>
      <input className="text" type="search" placeholder="Search exercises" aria-label="Search exercises" autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <select className="num" aria-label="Muscle group" value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleGroup | '')}>
          <option value="">All muscles</option>
          {MUSCLE_LIST.map((m) => <option key={m} value={m}>{MUSCLE_LABELS[m]}</option>)}
        </select>
        <select className="num" aria-label="Equipment" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment | '')}>
          <option value="">All equipment</option>
          {EQUIPMENT_LIST.map((q) => <option key={q} value={q}>{EQUIPMENT_LABELS[q]}</option>)}
        </select>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>{rows.length} exercise{rows.length === 1 ? '' : 's'}</div>
      <div className="browser">
        {rows.length === 0 && <div className="muted" style={{ padding: 12 }}>No exercises match.</div>}
        {rows.map((e) => {
          const st = snap.exerciseStates[e.id];
          return (
            <button className="ex-row browse" key={e.id} onClick={() => onPick(e)}>
              <Thumb exercise={e} />
              <span className="grow" style={{ textAlign: 'left' }}>
                <span className="name">{e.name}</span>
                <span className="sub" style={{ display: 'block' }}>{EQUIPMENT_LABELS[e.equipment]} · {MUSCLE_LABELS[e.primaryMuscle]}{e.isCustom ? ' · custom' : ''}</span>
              </span>
              {st ? <span className="w" style={{ fontSize: 16 }}>{formatNumber(st.e1rm, 1)} <span className="muted" style={{ fontSize: 12 }}>{unit}</span></span> : null}
              {trailing?.(e)}
            </button>
          );
        })}
      </div>
    </>
  );
}
