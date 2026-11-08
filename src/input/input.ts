export interface DriveInput { throttle: number; brake: number; steer: number; handbrake: boolean }
export type OneShot = 'togglePhone' | 'drink' | 'pause' | 'mute';

const ONE_SHOT_KEYS: Record<string, OneShot> = { KeyQ: 'togglePhone', KeyE: 'drink', Escape: 'pause', KeyM: 'mute' };
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  private held = new Set<string>();
  private pressed = new Set<OneShot>();

  constructor(private target: Window) {
    target.addEventListener('keydown', this.onDown as EventListener);
    target.addEventListener('keyup', this.onUp as EventListener);
    target.addEventListener('blur', this.onBlur);
  }

  private onDown = (e: KeyboardEvent): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.held.add(e.code);
    const one = ONE_SHOT_KEYS[e.code];
    if (one) this.pressed.add(one);
  };
  private onUp = (e: KeyboardEvent): void => { this.held.delete(e.code); };
  private onBlur = (): void => { this.held.clear(); this.pressed.clear(); };

  private any(...codes: string[]): boolean { return codes.some((c) => this.held.has(c)); }

  drive(): DriveInput {
    const left = this.any('KeyA', 'ArrowLeft'), right = this.any('KeyD', 'ArrowRight');
    return {
      throttle: this.any('KeyW', 'ArrowUp') ? 1 : 0,
      brake: this.any('KeyS', 'ArrowDown') ? 1 : 0,
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      handbrake: this.held.has('Space'),
    };
  }

  consumePressed(a: OneShot): boolean { return this.pressed.delete(a); }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown as EventListener);
    this.target.removeEventListener('keyup', this.onUp as EventListener);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
