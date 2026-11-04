import { useState } from 'react';
import { db } from '../db/db';
import { createCustomExercise, updateCustomExercise, type CustomExerciseInput } from '../db/libraryService';
import {
  EQUIPMENT_LABELS, EQUIPMENT_LIST, FAMILY_LABELS, MUSCLE_LABELS, MUSCLE_LIST, PROGRESSION_LABELS,
  type Equipment, type ExerciseDef, type FamilyId, type MuscleGroup, type ProgressionStyle,
} from '../engine';
import { Sheet } from './components';

const FAMILIES = Object.keys(FAMILY_LABELS) as FamilyId[];

/** Create (no `exercise`) or edit a custom exercise. */
export function ExerciseForm({ exercise, onClose, onSaved }: { exercise?: ExerciseDef; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(exercise?.name ?? '');
  const [equipment, setEquipment] = useState<Equipment>(exercise?.equipment ?? 'dumbbell');
  const [muscle, setMuscle] = useState<MuscleGroup>(exercise?.primaryMuscle ?? 'chest');
  const [style, setStyle] = useState<ProgressionStyle>(exercise?.defaultProgressionStyle ?? 'repsFirst');
  const [family, setFamily] = useState<FamilyId | ''>(exercise?.family ?? '');
  const [ratio, setRatio] = useState(String(exercise?.familyRatio ?? 1));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const input: CustomExerciseInput = {
      name, equipment, primaryMuscle: muscle, defaultProgressionStyle: style,
      ...(family ? { family, familyRatio: parseFloat(ratio.replace(',', '.')) } : {}),
    };
    const r = exercise ? await updateCustomExercise(db, exercise.id, input) : await createCustomExercise(db, input);
    if ('error' in r) setError(r.error);
    else onSaved(exercise ? exercise.id : (r as { id: string }).id);
  }

  return (
    <Sheet onClose={onClose}>
      <h2>{exercise ? 'Edit exercise' : 'New exercise'}</h2>
      <label className="muted" style={{ fontSize: 12 }}>Name
        <input className="text" aria-label="Name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row">
        <label className="grow muted" style={{ fontSize: 12 }}>Equipment (sets the step)
          <select className="num" aria-label="Equipment" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
            {EQUIPMENT_LIST.map((q) => <option key={q} value={q}>{EQUIPMENT_LABELS[q]}</option>)}
          </select>
        </label>
        <label className="grow muted" style={{ fontSize: 12 }}>Primary muscle
          <select className="num" aria-label="Primary muscle" value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleGroup)}>
            {MUSCLE_LIST.map((m) => <option key={m} value={m}>{MUSCLE_LABELS[m]}</option>)}
          </select>
        </label>
      </div>
      <label className="muted" style={{ fontSize: 12 }}>Default progression
        <select className="num" aria-label="Default progression" value={style} onChange={(e) => setStyle(e.target.value as ProgressionStyle)}>
          {(Object.keys(PROGRESSION_LABELS) as ProgressionStyle[]).map((p) => <option key={p} value={p}>{PROGRESSION_LABELS[p]}</option>)}
        </select>
      </label>
      <div className="row">
        <label className="grow muted" style={{ fontSize: 12 }}>Movement family (optional)
          <select className="num" aria-label="Movement family" value={family} onChange={(e) => setFamily(e.target.value as FamilyId | '')}>
            <option value="">None — starts with a calibration set</option>
            {FAMILIES.map((f) => <option key={f} value={f}>{FAMILY_LABELS[f]}</option>)}
          </select>
        </label>
        {family && (
          <label className="muted" style={{ fontSize: 12, width: 96 }}>Ratio
            <input className="num" aria-label="Ratio to the family anchor" inputMode="decimal" value={ratio} onChange={(e) => setRatio(e.target.value)} />
          </label>
        )}
      </div>
      {family && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Ratio: how heavy this is compared with the family’s anchor lift ({FAMILY_LABELS[family]}), which is 1.0. It’s used to predict a first weight.</p>}
      {error && <div className="explainer" role="alert">{error}</div>}
      <button className="btn primary block" onClick={save}>{exercise ? 'Save' : 'Create exercise'}</button>
      <button className="btn secondary block" onClick={onClose}>Cancel</button>
    </Sheet>
  );
}
