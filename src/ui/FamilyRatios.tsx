import { db } from '../db/db';
import type { Snapshot } from '../db/service';
import { setFamilyRatio } from '../db/settingsService';
import { FAMILY_LABELS, type FamilyId } from '../engine';
import { NumField, SubHeader } from './fields';

export function FamilyRatios({ snap, onBack }: { snap: Snapshot; onBack: () => void }) {
  const families = [...new Set(Object.values(snap.exercises).map((e) => e.family))] as FamilyId[];
  return (
    <div className="page">
      <SubHeader title="Family ratios" onBack={onBack} />
      <p className="muted" style={{ margin: 0 }}>How strong each exercise is relative to its family. Used to predict a weight when an exercise has no history. Dumbbell ratios are per dumbbell.</p>
      {families.map((f) => (
        <div className="card" key={f}>
          <h2 style={{ marginBottom: 8 }}>{FAMILY_LABELS[f]}</h2>
          {Object.values(snap.exercises).filter((e) => e.family === f).map((e) => (
            <div className="ex-row" key={e.id}>
              <span className="name">{e.name}</span>
              <div style={{ width: 100 }}><NumField label={`${e.name} ratio`} value={e.familyRatio} min={0.01} onCommit={(v) => setFamilyRatio(db, e.id, v)} /></div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
