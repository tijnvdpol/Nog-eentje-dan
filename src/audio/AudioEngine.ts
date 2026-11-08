import { enginePitchHz, lowpassCutoffHz, wobbleCents } from './soundParams';

export type OneShot = 'crash' | 'ping' | 'beer' | 'kaching' | 'horn' | 'flits';
type LoopName = 'engine' | 'tires';
type SoundName = LoopName | OneShot;

const MUTE_KEY = 'nog-eentje-dan:muted';
const SOUND_NAMES: SoundName[] = ['engine', 'tires', 'crash', 'ping', 'beer', 'kaching', 'horn', 'flits'];
/** Pitch of an engine recording at playbackRate 1 (an engine.mp3 is played faster or slower around this). */
const ENGINE_FILE_BASE_HZ = 110;
const WOBBLE_HZ = 0.5;
const SMOOTH = 0.05;

type AudioCtor = new () => AudioContext;

/**
 * Generated game sound (spec fase 2 §8.3) with the Web Audio API: an engine, tyre squeal and five one-shots,
 * all through one "drunk" lowpass. A file in public/sounds/<name>.mp3 replaces the generated sound. Without
 * Web Audio (or when it fails) this is a silent engine whose methods do nothing.
 */
export class AudioEngine {
  muted: boolean;
  private volume = 1;
  private master: GainNode | null = null;
  private drunk: BiquadFilterNode | null = null;
  private engineNodes: { oscs: OscillatorNode[]; gain: GainNode } | null = null;
  private engineFile: AudioBufferSourceNode | null = null;
  private tiresGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private files: Partial<Record<SoundName, AudioBuffer>> = {};
  private loopsStarted = false;

  private constructor(private ctx: AudioContext | null, private storage: Storage | null) {
    this.muted = this.readMuted();
    if (!ctx) return;
    try {
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.drunk = ctx.createBiquadFilter();
      this.drunk.type = 'lowpass';
      this.drunk.frequency.value = lowpassCutoffHz(0);
      this.drunk.connect(this.master).connect(ctx.destination);
      this.noise = this.makeNoise(1);
    } catch {
      this.ctx = null;
    }
  }

  static create(win: Window = window): AudioEngine {
    const w = win as Window & { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    let ctx: AudioContext | null = null;
    try { if (Ctor) ctx = new Ctor(); } catch { ctx = null; }
    let storage: Storage | null = null;
    try { storage = w.localStorage ?? null; } catch { storage = null; }
    return new AudioEngine(ctx, storage);
  }

  /** Start (or continue) sound; call from a user gesture such as the Start click. */
  async resume(): Promise<void> {
    if (!this.ctx) return;
    try { await this.ctx.resume(); } catch { /* autoplay blocked: stay silent */ }
    if (!this.loopsStarted) this.startLoops();
  }

  suspend(): void { this.ctx?.suspend().catch(() => {}); }

  setMuted(m: boolean): void {
    this.muted = m;
    try { this.storage?.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* storage blocked */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, SMOOTH);
  }

  /** Master volume 0..1 (settings screen); a silent engine just remembers it. */
  setVolume(v01: number): void {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(v01) ? v01 : 1));
    if (this.master && this.ctx && !this.muted) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, SMOOTH);
  }

  update(s: { speedKmh: number; slipping: boolean; promille: number; timeSec: number }): void {
    const ctx = this.ctx;
    if (!ctx || !this.drunk) return;
    const now = ctx.currentTime;
    this.drunk.frequency.setTargetAtTime(lowpassCutoffHz(s.promille), now, SMOOTH);
    const detune = wobbleCents(s.promille) * Math.sin(2 * Math.PI * WOBBLE_HZ * s.timeSec);
    const hz = enginePitchHz(s.speedKmh);
    if (this.engineFile) {
      this.engineFile.playbackRate.setTargetAtTime(hz / ENGINE_FILE_BASE_HZ, now, SMOOTH);
      this.engineFile.detune.setTargetAtTime(detune, now, SMOOTH);
    } else if (this.engineNodes) {
      this.engineNodes.oscs[0].frequency.setTargetAtTime(hz, now, SMOOTH);
      this.engineNodes.oscs[1].frequency.setTargetAtTime(hz / 2, now, SMOOTH);
      for (const o of this.engineNodes.oscs) o.detune.setTargetAtTime(detune, now, SMOOTH);
    }
    this.tiresGain?.gain.setTargetAtTime(s.slipping ? 0.22 : 0, now, SMOOTH);
  }

  play(name: OneShot, volume = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.drunk || this.muted || ctx.state !== 'running') return;
    try {
      const out = ctx.createGain();
      out.gain.value = Math.max(0, Math.min(1, volume));
      out.connect(this.drunk);
      const file = this.files[name];
      if (file) {
        const src = ctx.createBufferSource();
        src.buffer = file;
        src.connect(out);
        src.start();
        return;
      }
      SYNTH[name](ctx, out, this.noise!);
    } catch { /* never let sound break the game */ }
  }

  /** Try public/sounds/<name>.mp3 for every sound; a missing or broken file keeps the generated sound. */
  async loadOverrides(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(SOUND_NAMES.map(async (name) => {
      try {
        const res = await fetch(`sounds/${name}.mp3`);
        if (!res.ok || !(res.headers.get('content-type') ?? '').includes('audio')) return;
        this.files[name] = await ctx.decodeAudioData(await res.arrayBuffer());
      } catch { /* fall back to synthesis */ }
    }));
    if (this.loopsStarted) this.restartLoops();
  }

  private readMuted(): boolean {
    try { return this.storage?.getItem(MUTE_KEY) === '1'; } catch { return false; }
  }

  private startLoops(): void {
    const ctx = this.ctx!;
    this.loopsStarted = true;
    try {
      const engineGain = ctx.createGain();
      engineGain.gain.value = 0.1;
      engineGain.connect(this.drunk!);
      if (this.files.engine) {
        const src = ctx.createBufferSource();
        src.buffer = this.files.engine; src.loop = true;
        src.connect(engineGain); src.start();
        this.engineFile = src;
      } else {
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass'; tone.frequency.value = 900;
        tone.connect(engineGain);
        const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = enginePitchHz(0);
        const sq = ctx.createOscillator(); sq.type = 'square'; sq.frequency.value = enginePitchHz(0) / 2;
        const sqGain = ctx.createGain(); sqGain.gain.value = 0.5;
        saw.connect(tone); sq.connect(sqGain).connect(tone);
        saw.start(); sq.start();
        this.engineNodes = { oscs: [saw, sq], gain: engineGain };
      }

      this.tiresGain = ctx.createGain();
      this.tiresGain.gain.value = 0;
      this.tiresGain.connect(this.drunk!);
      const tires = ctx.createBufferSource();
      tires.loop = true;
      if (this.files.tires) { tires.buffer = this.files.tires; tires.connect(this.tiresGain); }
      else {
        tires.buffer = this.noise;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass'; band.frequency.value = 2400; band.Q.value = 6;
        tires.connect(band).connect(this.tiresGain);
      }
      tires.start();
    } catch { /* stay silent */ }
  }

  private restartLoops(): void {
    try {
      for (const o of this.engineNodes?.oscs ?? []) o.stop();
      this.engineNodes?.gain.disconnect();
      this.engineFile?.stop();
      this.tiresGain?.disconnect();
    } catch { /* already stopped */ }
    this.engineNodes = null; this.engineFile = null; this.tiresGain = null;
    this.startLoops();
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
}

/** Short generated one-shots. Each builds its nodes, connects them to `out` and schedules them. */
const SYNTH: Record<OneShot, (ctx: AudioContext, out: AudioNode, noise: AudioBuffer) => void> = {
  crash(ctx, out, noise) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.5);
    const g = envelope(ctx, t, 0.9, 0.6);
    src.connect(lp).connect(g).connect(out);
    src.start(t); src.stop(t + 0.7);
    const thump = ctx.createOscillator(); thump.type = 'sine';
    thump.frequency.setValueAtTime(120, t); thump.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    thump.connect(envelope(ctx, t, 0.8, 0.35)).connect(out);
    thump.start(t); thump.stop(t + 0.4);
  },
  ping(ctx, out) {
    const t = ctx.currentTime;
    [[880, 0], [1320, 0.09]].forEach(([f, d]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      o.connect(envelope(ctx, t + d, 0.25, 0.18)).connect(out);
      o.start(t + d); o.stop(t + d + 0.2);
    });
  },
  beer(ctx, out, noise) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
    src.connect(hp).connect(envelope(ctx, t, 0.5, 0.45)).connect(out);
    src.start(t); src.stop(t + 0.5);
  },
  flits(ctx, out, noise) {
    const t = ctx.currentTime;
    const click = ctx.createBufferSource(); click.buffer = noise;
    click.connect(envelope(ctx, t, 0.5, 0.02)).connect(out);
    click.start(t); click.stop(t + 0.03);
    const hiss = ctx.createBufferSource(); hiss.buffer = noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    hiss.connect(hp).connect(envelope(ctx, t + 0.03, 0.3, 0.08)).connect(out);
    hiss.start(t + 0.03); hiss.stop(t + 0.12);
  },
  kaching(ctx, out, noise) {
    const t = ctx.currentTime;
    const click = ctx.createBufferSource(); click.buffer = noise;
    click.connect(envelope(ctx, t, 0.3, 0.04)).connect(out);
    click.start(t); click.stop(t + 0.05);
    [[1568, 0.05], [2093, 0.13]].forEach(([f, d]) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      o.connect(envelope(ctx, t + d, 0.3, 0.5)).connect(out);
      o.start(t + d); o.stop(t + d + 0.55);
    });
  },
  horn(ctx, out) {
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    const g = envelope(ctx, t, 0.18, 0.5, 0.45);
    lp.connect(g).connect(out);
    for (const f of [392, 494]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      o.connect(lp); o.start(t); o.stop(t + 0.55);
    }
  },
};

/** A gain that jumps to `peak` and decays to silence over `len` s (or holds until `hold` s, then fades). */
function envelope(ctx: AudioContext, t: number, peak: number, len: number, hold = 0): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  if (hold) g.gain.setValueAtTime(peak, t + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(len, hold + 0.05));
  return g;
}
