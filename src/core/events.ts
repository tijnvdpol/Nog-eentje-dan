export class EventBus<M extends Record<string, unknown>> {
  private handlers = new Map<keyof M, Set<(p: never) => void>>();
  on<K extends keyof M>(k: K, fn: (p: M[K]) => void): () => void {
    let set = this.handlers.get(k);
    if (!set) this.handlers.set(k, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => { set!.delete(fn as (p: never) => void); };
  }
  emit<K extends keyof M>(k: K, p: M[K]): void {
    this.handlers.get(k)?.forEach((fn) => (fn as (p: M[K]) => void)(p));
  }
}

export type GameEvents = {
  like: { postId: string };
  phoneToggled: { up: boolean };
  drinkStarted: {};
  cracks: { levels: number[] };
  gameOver: { reason: 'wrecked' | 'passedOut' };
  taskStarted: { taskId: string };
  taskResolved: { taskId: string; success: boolean; points: number };
  redLight: { points: number };
  nearMiss: { kind: 'jogger' | 'student' | 'oma' };
  beerEmpty: {};
  refilled: {};
  horn: {};
};
