import { afterEach, describe, expect, it, vi } from 'vitest';

/** Minimal AudioContext stand-in that behaves like iOS Safari: a context starts suspended. */
class FakeAudioContext {
  static created = 0;
  state: 'suspended' | 'running' = 'suspended';
  currentTime = 0;
  oscillators = 0;
  constructor() { FakeAudioContext.created++; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createOscillator() {
    this.oscillators++;
    return { frequency: { value: 0 }, connect: (n: unknown) => n, start() {}, stop() {} };
  }
  createGain() { return { gain: { value: 0 }, connect: (n: unknown) => n }; }
  get destination() { return {}; }
}

async function load() {
  vi.resetModules();
  FakeAudioContext.created = 0;
  vi.stubGlobal('window', { AudioContext: FakeAudioContext });
  return import('./RestTimer');
}

afterEach(() => vi.unstubAllGlobals());

describe('rest timer countdown', () => {
  it('is computed from the end timestamp, never above the rest length, never below zero', async () => {
    const { remainingMs } = await load();
    const rest = { endsAt: 100_000, total: 75 };
    expect(remainingMs(rest, 25_000)).toBe(75_000);
    expect(remainingMs(rest, 24_800)).toBe(75_000); // a stale "now" from the previous tick: was 75.2 s → "1:16"
    expect(remainingMs(rest, 70_000)).toBe(30_000); // e.g. after the app was in the background
    expect(remainingMs(rest, 200_000)).toBe(0);
    // +30 s grows both the end and the total, so the cap never cuts the extra time
    expect(remainingMs({ endsAt: 130_000, total: 105 }, 60_000)).toBe(70_000);
  });
});

describe('rest timer sound', () => {
  it('creates and resumes the audio context on the user’s tap, and the beep at zero reuses it', async () => {
    const { primeAudio, beep } = await load();
    primeAudio(); // tapping Done: inside a user gesture
    expect(FakeAudioContext.created).toBe(1);
    primeAudio(); // later taps reuse it
    beep(); // timer reaches zero: no new (suspended) context
    beep();
    expect(FakeAudioContext.created).toBe(1);
  });

  it('a primed context is running when the beep plays', async () => {
    const { primeAudio, beep } = await load();
    const spy = vi.spyOn(FakeAudioContext.prototype, 'createOscillator');
    primeAudio();
    await Promise.resolve();
    beep();
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.contexts[0] as FakeAudioContext).state).toBe('running');
  });

  it('does nothing (and does not throw) where Web Audio is missing', async () => {
    const { primeAudio, beep } = await load();
    vi.stubGlobal('window', {});
    expect(() => { primeAudio(); beep(); }).not.toThrow();
  });
});
