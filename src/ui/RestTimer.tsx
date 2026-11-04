import { useEffect, useRef, useState } from 'react';

export interface RestState { endsAt: number; total: number; }
const KEY = 'lift.rest';

export function loadRest(): RestState | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && typeof v.endsAt === 'number' ? v : null; } catch { return null; }
}
export function saveRest(r: RestState | null) {
  try { if (r) localStorage.setItem(KEY, JSON.stringify(r)); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

let audio: AudioContext | null = null;

/**
 * iOS Safari only lets a page start sound from inside a user gesture: an AudioContext created when the timer
 * runs out stays suspended and plays nothing. So the context is created (or resumed) when the user taps Done,
 * and the beep at zero reuses it.
 */
export function primeAudio(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === 'suspended') audio.resume().catch(() => { /* not allowed yet */ });
  } catch { /* audio unavailable */ }
}

export function beep(): void {
  try {
    if (!audio) primeAudio();
    const ctx = audio;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch { /* audio blocked */ }
}

/**
 * Milliseconds left, from the stored end timestamp. `now` can lag behind the real clock by up to one tick when a
 * new rest starts while the timer is already on screen, so it is capped at the rest length (no "3:01" for a 3:00 rest).
 */
export function remainingMs(rest: RestState, now: number): number {
  return Math.max(0, Math.min(rest.endsAt - now, rest.total * 1000));
}

/** Remaining time is always computed from the stored end timestamp, never by counting ticks. */
export function RestTimer({ rest, sound, onChange }: { rest: RestState; sound: boolean; onChange: (r: RestState | null) => void }) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    fired.current = rest.endsAt <= Date.now();
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [rest.endsAt]);

  const remaining = remainingMs(rest, now);
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
      onClick={() => { if (sound) primeAudio(); onChange({ endsAt: Math.max(rest.endsAt, Date.now()) + 30000, total: rest.total + 30 }); }}
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
