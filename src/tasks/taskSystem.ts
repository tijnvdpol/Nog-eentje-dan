import { CONFIG } from '../config';
import type { Place } from '../world/types';
import type { TaskDef, TaskEvent } from './types';

export type { TaskDef, TaskEvent } from './types';

export interface TaskContext {
  timeSec: number;
  player: { x: number; z: number };
  speedKmh: number;
  places: readonly Place[];
  isLiked: (postId: string) => boolean;
}

const DEFAULT_SUCCESS = 'Top! 👍';
const DEFAULT_FAIL = 'Laat maar dan 🙄';

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Checks one entry of tasks.json; returns the reason it is invalid, or null. */
function invalid(d: Record<string, unknown>, known: { postIds: ReadonlySet<string>; placeIds: ReadonlySet<string> }): string | null {
  if (!isStr(d.id) || !isStr(d.from) || !isStr(d.text) || !isNum(d.timeLimitSec) || !isNum(d.reward)) return 'missing or bad common fields';
  for (const k of ['onSuccess', 'onFail']) if (d[k] !== undefined && !isStr(d[k])) return `bad ${k}`;
  switch (d.type) {
    case 'chat':
      if (!Array.isArray(d.answers) || d.answers.length !== 3 || !d.answers.every(isStr)) return 'chat needs exactly 3 answers';
      if (!Array.isArray(d.correct) || !d.correct.length || !d.correct.every((i) => Number.isInteger(i) && i >= 0 && i < 3)) return 'bad correct indexes';
      return null;
    case 'like': return isStr(d.postId) && known.postIds.has(d.postId) ? null : `unknown postId ${String(d.postId)}`;
    case 'destination': return isStr(d.target) && known.placeIds.has(d.target) ? null : `unknown target ${String(d.target)}`;
    default: return `unknown type ${String(d.type)}`;
  }
}

/**
 * Phone tasks (spec fase 2 §3): one at a time, the first 20 s after the intro, the next 45–60 s after the
 * previous one ends. Time only passes through `update(dt)`, so a paused game never runs out a task.
 */
export class TaskSystem {
  readonly defs: readonly TaskDef[];
  private current: { def: TaskDef; remainingSec: number } | null = null;
  private nextAt: number | null = null;
  private lastId: string | null = null;
  private now = 0;

  constructor(defs: unknown[], private rng: () => number, known: { postIds: ReadonlySet<string>; placeIds: ReadonlySet<string> }) {
    const ok: TaskDef[] = [];
    for (const raw of defs) {
      const d = (raw ?? {}) as Record<string, unknown>;
      const why = invalid(d, known);
      if (why) console.warn(`tasks.json: opdracht ${String(d.id)} overgeslagen (${why})`);
      else ok.push(d as unknown as TaskDef);
    }
    this.defs = ok;
  }

  get active(): { def: TaskDef; remainingSec: number; fraction: number } | null {
    const c = this.current;
    return c ? { def: c.def, remainingSec: c.remainingSec, fraction: Math.max(0, c.remainingSec / c.def.timeLimitSec) } : null;
  }

  /** Schedule the first task 20 s after the last intro message. */
  start(introEndSec: number): void { this.nextAt = introEndSec + CONFIG.tasks.firstDelaySec; }

  update(dt: number, ctx: TaskContext): TaskEvent[] {
    this.now = ctx.timeSec;
    const c = this.current;
    if (c) {
      c.remainingSec -= dt;
      if (c.def.type === 'destination' && this.arrived(c.def.target, ctx)) return this.resolve(true);
      if (c.remainingSec <= 0) return this.resolve(false);
      return [];
    }
    if (this.nextAt === null || ctx.timeSec < this.nextAt) return [];
    const options = this.defs.filter((d) => d.id !== this.lastId && this.eligible(d, ctx));
    if (!options.length) return [];
    const def = options[Math.floor(this.rng() * options.length) % options.length];
    this.current = { def, remainingSec: def.timeLimitSec };
    this.lastId = def.id;
    this.nextAt = null;
    return [{ type: 'started', task: def }];
  }

  /** Answer the active chat task (button index 0..2). */
  answer(index: number): TaskEvent[] {
    const c = this.current;
    if (!c || c.def.type !== 'chat') return [];
    return this.resolve(c.def.correct.includes(index));
  }

  /** A post was liked: completes an active like task for that post. */
  liked(postId: string): TaskEvent[] {
    const c = this.current;
    if (!c || c.def.type !== 'like' || c.def.postId !== postId) return [];
    return this.resolve(true);
  }

  reset(): void { this.current = null; this.nextAt = null; this.lastId = null; this.now = 0; }

  private eligible(d: TaskDef, ctx: TaskContext): boolean {
    if (d.type === 'like') return !ctx.isLiked(d.postId);
    if (d.type === 'destination') {
      const p = ctx.places.find((x) => x.id === d.target);
      return !!p && Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z) >= CONFIG.tasks.destMinDistM;
    }
    return true;
  }

  private arrived(target: Place['id'], ctx: TaskContext): boolean {
    const p = ctx.places.find((x) => x.id === target);
    return !!p && Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z) <= CONFIG.tasks.arriveRadiusM && Math.abs(ctx.speedKmh) < CONFIG.tasks.arriveMaxKmh;
  }

  private resolve(success: boolean): TaskEvent[] {
    const def = this.current!.def;
    this.current = null;
    const T = CONFIG.tasks;
    this.nextAt = this.now + T.gapMinSec + this.rng() * (T.gapMaxSec - T.gapMinSec);
    return [{ type: 'resolved', task: def, success, reply: success ? def.onSuccess ?? DEFAULT_SUCCESS : def.onFail ?? DEFAULT_FAIL }];
  }
}
