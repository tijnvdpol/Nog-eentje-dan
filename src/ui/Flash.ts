import { CONFIG } from '../config';

/** White camera flash over the whole screen: opacity 0.8 → 0 in CONFIG.speedCamera.flashSec. */
export class Flash {
  private el: HTMLElement;

  constructor(root: HTMLElement) {
    this.el = root.querySelector<HTMLElement>('#flash') ?? root.appendChild(Object.assign(document.createElement('div'), { id: 'flash' }));
    this.el.style.animationDuration = `${CONFIG.speedCamera.flashSec}s`;
  }

  trigger(): void {
    this.el.classList.remove('on');
    void this.el.offsetWidth; // restart the animation
    this.el.classList.add('on');
  }
}
