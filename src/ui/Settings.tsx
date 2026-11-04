import { useRef, useState } from 'react';
import { db } from '../db/db';
import { exportData, importData } from '../db/backup';
import type { Snapshot } from '../db/service';
import { resetAllData, setIncrement, setRestTimes, switchUnits } from '../db/settingsService';
import type { Equipment, Unit } from '../engine';
import imageSources from '../data/imageSources.json';
import { NumField } from './fields';
import { FamilyRatios } from './FamilyRatios';
import { ProgramEditor } from './ProgramEditor';

const EQUIPMENT: [Equipment, string][] = [
  ['barbell', 'Barbell (total load)'], ['dumbbell', 'Dumbbell (each)'], ['machine', 'Machine'], ['cable', 'Cable'], ['bodyweight', 'Bodyweight (added load)'],
];

export function Settings({ snap, onBack }: { snap: Snapshot; onBack: () => void }) {
  const s = snap.settings;
  const [sub, setSub] = useState<null | 'program' | 'ratios'>(null);
  const [about, setAbout] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const update = (patch: Partial<typeof s>) => db.settings.update('main', patch);

  if (sub === 'program') return <ProgramEditor snap={snap} onBack={() => setSub(null)} />;
  if (sub === 'ratios') return <FamilyRatios snap={snap} onBack={() => setSub(null)} />;

  async function doExport() {
    const data = await exportData(db);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `lift-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('Backup downloaded.');
  }

  async function doImport(f: File) {
    try {
      const json = JSON.parse(await f.text());
      if (!window.confirm('Importing replaces ALL current data with the backup. Continue?')) return;
      await importData(db, json);
      setMsg('Backup imported.');
    } catch (e) {
      setMsg(`Import failed: ${(e instanceof Error ? e.message : 'unreadable file').replace(/\.$/, '')}. Nothing was changed.`);
    } finally {
      if (file.current) file.current.value = '';
    }
  }

  const changeUnit = async (u: Unit) => {
    if (u === s.units) return;
    if (window.confirm(`Switch to ${u}? All stored weights and e1RMs are converted and prescriptions re-rounded. Your custom increments reset to the ${u} defaults.`)) await switchUnits(db, u);
  };

  return (
    <div className="page">
      <div className="row"><button className="icon-btn" onClick={onBack} aria-label="Back">←</button><h1>Settings</h1></div>
      {msg && <div className="explainer" role="status">{msg}</div>}

      <div className="card">
        <h2 style={{ marginBottom: 8 }}>Units</h2>
        <div className="row">
          {(['kg', 'lb'] as Unit[]).map((u) => <button key={u} className={`btn grow ${s.units === u ? 'primary' : 'secondary'}`} onClick={() => changeUnit(u)}>{u}</button>)}
        </div>
        <label className="muted" style={{ display: 'block', marginTop: 12 }}>Bodyweight ({s.units}) — used for pull-ups and other bodyweight lifts
          <NumField label="Bodyweight" value={s.bodyweight ?? 0} onCommit={(v) => update({ bodyweight: v > 0 ? v : null })} />
        </label>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 8 }}>Increments ({s.units})</h2>
        {EQUIPMENT.map(([eq, label]) => (
          <div className="ex-row" key={eq}><span className="name">{label}</span><div style={{ width: 100 }}><NumField label={`${eq} increment`} value={s.increments[eq]} min={0.25} onCommit={(v) => setIncrement(db, eq, v)} /></div></div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 8 }}>Rest timer (seconds)</h2>
        {([['pair', 'Between superset pair'], ['main', 'After a group with a main lift'], ['accessory', 'After an accessory group']] as const).map(([k, label]) => (
          <div className="ex-row" key={k}><span className="name">{label}</span><div style={{ width: 100 }}><NumField label={`${k} rest`} integer min={0} value={s.restTimes[k]} onCommit={(v) => setRestTimes(db, { ...s.restTimes, [k]: v })} /></div></div>
        ))}
        <label className="switch">Timer sound<input type="checkbox" checked={s.timerSound} onChange={(e) => update({ timerSound: e.target.checked })} /></label>
        <label className="switch">Keep screen awake during workouts<input type="checkbox" checked={s.keepScreenAwake} onChange={(e) => update({ keepScreenAwake: e.target.checked })} /></label>
      </div>

      <div className="card">
        <h2>Return phase</h2>
        <p className="muted">{s.returnPhase.active ? `Session ${s.returnPhase.sessionsCompleted + 1} of 12. Main lifts use one set fewer and a lighter target until session 7.` : 'Off.'}</p>
        {s.returnPhase.active && <button className="btn secondary block" onClick={() => window.confirm('End the return phase now?') && update({ returnPhase: { ...s.returnPhase, active: false } })}>End return phase early</button>}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn secondary block" onClick={() => setSub('program')}>Edit program</button>
        <button className="btn secondary block" onClick={() => setSub('ratios')}>Family ratios</button>
        <button className="btn secondary block" onClick={() => update({ onboarded: false })}>Enter remembered lifts again</button>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2>Backup</h2>
        <p className="muted" style={{ margin: 0 }}>Your data only lives in this browser. Export a copy now and then.</p>
        <button className="btn secondary block" onClick={doExport}>Export JSON</button>
        <button className="btn secondary block" onClick={() => file.current?.click()}>Import JSON</button>
        <input ref={file} type="file" accept="application/json,.json" hidden aria-label="Import file" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        <button className="btn block" style={{ background: 'color-mix(in srgb, var(--rpe10) 14%, var(--card))', color: 'var(--rpe10)' }}
          onClick={async () => { if (window.confirm('Delete ALL workouts, strength estimates and settings? This cannot be undone.') && window.confirm('Really erase everything? Export a backup first if unsure.')) { await resetAllData(db); } }}>Reset all data</button>
      </div>

      <div className="card">
        <button className="btn secondary block" onClick={() => setAbout(!about)}>About</button>
        {about && (
          <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5 }}>
            <p>Lift is a personal, offline workout tracker. No accounts, no servers.</p>
            <p><b>Exercise images</b> come from the <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noreferrer">Free Exercise DB</a> by yuhonas, released under the <b>Unlicense</b> (public domain dedication). {Object.keys(imageSources).length} images are bundled. Form cues are original.</p>
          </div>
        )}
      </div>
    </div>
  );
}
