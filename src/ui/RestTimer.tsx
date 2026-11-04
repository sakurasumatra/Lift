import { useEffect, useRef, useState } from 'react';

export interface RestState { endsAt: number; total: number; }
const KEY = 'lift.rest';

export function loadRest(): RestState | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && typeof v.endsAt === 'number' ? v : null; } catch { return null; }
}
export function saveRest(r: RestState | null) {
  try { if (r) localStorage.setItem(KEY, JSON.stringify(r)); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch { /* audio blocked */ }
}

/** Remaining time is always computed from the stored end timestamp, never by counting ticks. */
export function RestTimer({ rest, sound, onChange }: { rest: RestState; sound: boolean; onChange: (r: RestState | null) => void }) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    fired.current = rest.endsAt <= Date.now();
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [rest.endsAt]);

  const remaining = Math.max(0, rest.endsAt - now);
  useEffect(() => {
    if (remaining === 0 && !fired.current) {
      fired.current = true;
      if (sound) beep();
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* unsupported */ }
    }
  }, [remaining, sound]);

  const secs = Math.ceil(remaining / 1000);
  const pct = Math.min(100, (remaining / (rest.total * 1000)) * 100);
  return (
    <div
      className="rest"
      role="timer"
      onClick={() => onChange({ endsAt: Math.max(rest.endsAt, Date.now()) + 30000, total: rest.total + 30 })}
      // stopPropagation: the workout screen's own swipe (previous/next set) must not also fire.
      onTouchStart={(e) => { e.stopPropagation(); touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { e.stopPropagation(); if (touchX.current != null && Math.abs(e.changedTouches[0].clientX - touchX.current) > 70) onChange(null); touchX.current = null; }}
    >
      <div className="fill" style={{ width: `${pct}%` }} />
      <span className="t">{remaining === 0 ? 'Go! Next set' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</span>
      <span className="hint">tap +30s · swipe skip</span>
    </div>
  );
}
