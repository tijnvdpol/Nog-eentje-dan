/** Arrow at the top of the windscreen pointing at the destination of a task, with the distance (spec fase 2 §3.2). */
export class DestinationArrow {
  private el: HTMLElement;
  private icon: HTMLElement;
  private dist: HTMLElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'dest-arrow';
    this.el.hidden = true;
    this.icon = document.createElement('span'); this.icon.className = 'dest-arrow__icon'; this.icon.textContent = '⬆';
    this.dist = document.createElement('span'); this.dist.className = 'dest-arrow__dist';
    this.el.append(this.icon, this.dist);
    root.appendChild(this.el);
  }

  update(target: { x: number; z: number } | null, player: { x: number; z: number; heading: number }): void {
    this.el.hidden = !target;
    if (!target) return;
    const dx = target.x - player.x, dz = target.z - player.z;
    // heading 0 looks along +z and the driver's right is −x, so a positive angle difference is to the left
    let rel = Math.atan2(dx, dz) - player.heading;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const deg = Math.round((-rel * 180) / Math.PI) + 0;
    this.icon.style.transform = `rotate(${deg}deg)`;
    this.dist.textContent = `${Math.round(Math.hypot(dx, dz))} m`;
  }
}
