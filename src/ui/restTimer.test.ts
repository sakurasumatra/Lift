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
