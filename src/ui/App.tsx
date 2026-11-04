import { useEffect, useState } from 'react';
import { db, ensureSeeded } from '../db/db';
import { Home } from './Home';
import { Settings } from './Settings';
import { Summary } from './Summary';
import { Workout } from './Workout';
import { useActiveSession, useSession, useSnapshot } from './hooks';

type View = { name: 'home' } | { name: 'workout' } | { name: 'settings' } | { name: 'summary'; sessionId: string };

export function App() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>({ name: 'home' });
  useEffect(() => { ensureSeeded(db).then(() => setReady(true)); }, []);

  const snap = useSnapshot();
  const active = useActiveSession();
  const summarySession = useSession(view.name === 'summary' ? view.sessionId : undefined);

  if (!ready || !snap || active === undefined) return <div className="page muted">Loading…</div>;

  return (
    <div className="app">
      {view.name === 'home' && <Home snap={snap} active={active} onStart={() => setView({ name: 'workout' })} onSettings={() => setView({ name: 'settings' })} />}
      {view.name === 'settings' && <Settings snap={snap} onBack={() => setView({ name: 'home' })} />}
      {view.name === 'workout' && active && (
        <Workout snap={snap} session={active} onExit={() => setView({ name: 'home' })} onFinished={(id) => setView({ name: 'summary', sessionId: id })} />
      )}
      {view.name === 'workout' && !active && <Home snap={snap} active={null} onStart={() => setView({ name: 'workout' })} onSettings={() => setView({ name: 'settings' })} />}
      {view.name === 'summary' && summarySession && <Summary snap={snap} session={summarySession} onDone={() => setView({ name: 'home' })} />}
    </div>
  );
}
