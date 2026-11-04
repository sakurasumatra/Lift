import { useState } from 'react';
import { db } from '../db/db';
import type { Snapshot } from '../db/service';
import imageSources from '../data/imageSources.json';

export function Settings({ snap, onBack }: { snap: Snapshot; onBack: () => void }) {
  const s = snap.settings;
  const [bw, setBw] = useState(s.bodyweight != null ? String(s.bodyweight) : '');
  const [about, setAbout] = useState(false);
  const update = (patch: Partial<typeof s>) => db.settings.update('main', patch);

  return (
    <div className="page">
      <div className="row">
        <button className="icon-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>Settings</h1>
      </div>
      <div className="card">
        <label className="muted" htmlFor="bw">Bodyweight ({s.units}) — used for pull-ups and other bodyweight lifts</label>
        <input id="bw" className="num" inputMode="decimal" value={bw} placeholder="Not set" onChange={(e) => setBw(e.target.value)}
          onBlur={() => { const n = parseFloat(bw.replace(',', '.')); update({ bodyweight: n > 0 ? n : null }); }} />
      </div>
      <div className="card">
        <label className="switch">Keep screen awake during workouts
          <input type="checkbox" checked={s.keepScreenAwake} onChange={(e) => update({ keepScreenAwake: e.target.checked })} />
        </label>
        <label className="switch">Timer sound
          <input type="checkbox" checked={s.timerSound} onChange={(e) => update({ timerSound: e.target.checked })} />
        </label>
      </div>
      <div className="card">
        <h2>Return phase</h2>
        <p className="muted">
          {s.returnPhase.active
            ? `Session ${s.returnPhase.sessionsCompleted + 1} of 12. Main lifts use one set fewer and a lighter target until session 7.`
            : 'Off.'}
        </p>
        {s.returnPhase.active && (
          <button className="btn secondary block" onClick={() => window.confirm('End the return phase now?') && update({ returnPhase: { ...s.returnPhase, active: false } })}>End return phase early</button>
        )}
      </div>
      <div className="card">
        <button className="btn secondary block" onClick={() => setAbout(!about)}>About</button>
        {about && (
          <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5 }}>
            <p>Lift is a personal, offline workout tracker. No accounts, no servers.</p>
            <p>
              <b>Exercise images</b> come from the{' '}
              <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noreferrer">Free Exercise DB</a>{' '}
              by yuhonas, released under the <b>Unlicense</b> (public domain dedication). {Object.keys(imageSources).length} images are bundled.
              Form cues are original.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
