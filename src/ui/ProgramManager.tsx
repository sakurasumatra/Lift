import { useState } from 'react';
import { db } from '../db/db';
import type { Snapshot } from '../db/service';
import { createProgram, deleteProgram, duplicateProgram, renameProgram, setActiveProgram } from '../db/programService';
import { Sheet } from './components';
import { SubHeader } from './fields';
import { useActiveSession } from './hooks';
import { ProgramEditor } from './ProgramEditor';

/** Settings → Programs: keep several saved programs, pick the active one, create from blank or the template. */
export function ProgramManager({ snap, onBack }: { snap: Snapshot; onBack: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const active = useActiveSession();
  const activeId = snap.settings.activeProgramId;

  if (editing) return <ProgramEditor snap={snap} programId={editing} onBack={() => setEditing(null)} />;

  const dayCount = (id: string) => snap.days.filter((d) => d.programId === id).length;
  const slotCount = (id: string) => snap.days.filter((d) => d.programId === id).reduce((n, d) => n + d.slots.length, 0);

  async function create(from: 'blank' | 'template') {
    const id = await createProgram(db, name, from);
    setCreating(false);
    setName('');
    setEditing(id);
  }

  return (
    <div className="page">
      <SubHeader title="Programs" onBack={onBack} />
      {msg && <div className="explainer" role="status">{msg}</div>}
      {active && <div className="explainer">A workout is in progress. Finish it before changing programs.</div>}
      {snap.programs.length === 0 && <div className="card muted">No programs yet. Create your first one below.</div>}
      {snap.programs.map((p) => (
        <div className={`card ${p.id === activeId ? 'strong' : ''}`} key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row spread">
            {renaming === p.id ? (
              <input className="text" aria-label="Program name" autoFocus defaultValue={p.name}
                onBlur={(e) => { renameProgram(db, p.id, e.target.value); setRenaming(null); }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            ) : (
              <h2>{p.name}</h2>
            )}
            {p.id === activeId && <span className="badge">Active</span>}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>{dayCount(p.id)} day{dayCount(p.id) === 1 ? '' : 's'} · {slotCount(p.id)} exercises</div>
          <div className="row">
            {p.id !== activeId && <button className="btn small primary grow" disabled={!!active} onClick={() => setActiveProgram(db, p.id)}>Make active</button>}
            <button className="btn small secondary grow" onClick={() => setEditing(p.id)}>Edit</button>
          </div>
          <div className="row">
            <button className="btn small secondary grow" onClick={() => setRenaming(p.id)}>Rename</button>
            <button className="btn small secondary grow" onClick={() => duplicateProgram(db, p.id)}>Duplicate</button>
            <button className="btn small secondary grow" onClick={async () => {
              if (p.id === activeId) { setMsg('This program is active. Make another one active before deleting it.'); return; }
              if (!window.confirm(`Delete ${p.name}? Your workout history is kept.`)) return;
              const r = await deleteProgram(db, p.id);
              setMsg(r === 'in-use' ? 'A workout in progress is on one of its days. Finish it first.' : null);
            }}>Delete</button>
          </div>
        </div>
      ))}
      <button className="btn primary block" onClick={() => setCreating(true)}>＋ New program</button>
      <p className="muted" style={{ fontSize: 13 }}>Switching programs keeps every exercise’s strength estimate and history, and doesn’t restart the return phase. Deleting a program never deletes workout history.</p>

      {creating && (
        <Sheet onClose={() => setCreating(false)}>
          <h2>New program</h2>
          <input className="text" aria-label="New program name" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary block" onClick={() => create('blank')}>Blank — build it from scratch</button>
          <button className="btn secondary block" onClick={() => create('template')}>Start from template — 3-day full body</button>
          <button className="btn secondary block" onClick={() => setCreating(false)}>Cancel</button>
        </Sheet>
      )}
    </div>
  );
}
