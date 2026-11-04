import { useEffect, useState } from 'react';
import { db, ensureSeeded } from '../db/db';
import { ExerciseDetail, ExerciseList, HistoryList, SessionDetail } from './History';
import { Home } from './Home';
import { Onboarding } from './Onboarding';
import { Settings } from './Settings';
import { Summary } from './Summary';
import { Workout } from './Workout';
import { useActiveSession, useSession, useSnapshot } from './hooks';

type View =
  | { name: 'home' } | { name: 'workout' } | { name: 'settings' } | { name: 'history' } | { name: 'exercises' }
  | { name: 'summary'; sessionId: string }
  | { name: 'session'; sessionId: string }
  | { name: 'exercise'; exerciseId: string; back: View };

const TABS: { name: 'home' | 'history' | 'exercises' | 'settings'; icon: string; label: string }[] = [
  { name: 'home', icon: '🏠', label: 'Home' },
  { name: 'history', icon: '🗓', label: 'History' },
  { name: 'exercises', icon: '📈', label: 'Exercises' },
  { name: 'settings', icon: '⚙', label: 'Settings' },
];

export function App() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>({ name: 'home' });
  useEffect(() => { ensureSeeded(db).then(() => setReady(true)); }, []);

  const snap = useSnapshot();
  const active = useActiveSession();
  const summarySession = useSession(view.name === 'summary' ? view.sessionId : undefined);

  if (!ready || !snap?.settings || active === undefined) return <div className="page muted">Loading…</div>;

  if (!snap.settings.onboarded) return <div className="app"><Onboarding snap={snap} onDone={() => setView({ name: 'home' })} /></div>;

  const home = () => setView({ name: 'home' });
  const inWorkout = view.name === 'workout' && active;

  return (
    <div className="app">
      {view.name === 'home' && <Home snap={snap} active={active} onStart={() => setView({ name: 'workout' })} />}
      {view.name === 'settings' && <Settings snap={snap} onBack={home} />}
      {inWorkout && <Workout snap={snap} session={active} onExit={home} onFinished={(id) => setView({ name: 'summary', sessionId: id })} />}
      {view.name === 'workout' && !active && <Home snap={snap} active={null} onStart={() => setView({ name: 'workout' })} />}
      {view.name === 'summary' && summarySession && <Summary snap={snap} session={summarySession} onDone={home} />}
      {view.name === 'history' && <HistoryList snap={snap} onOpen={(sessionId) => setView({ name: 'session', sessionId })} />}
      {view.name === 'session' && <SessionDetail snap={snap} sessionId={view.sessionId} onBack={() => setView({ name: 'history' })} onExercise={(exerciseId) => setView({ name: 'exercise', exerciseId, back: view })} />}
      {view.name === 'exercises' && <ExerciseList snap={snap} onOpen={(exerciseId) => setView({ name: 'exercise', exerciseId, back: view })} />}
      {view.name === 'exercise' && <ExerciseDetail snap={snap} exerciseId={view.exerciseId} onBack={() => setView(view.back)} />}
      {!inWorkout && view.name !== 'summary' && (
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.name} className={view.name === t.name || (t.name === 'history' && view.name === 'session') || (t.name === 'exercises' && view.name === 'exercise') ? 'on' : ''} onClick={() => setView({ name: t.name } as View)}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
