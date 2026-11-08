import { CONFIG } from '../config';
import { signalLights } from '../traffic/signals';
import type { RoadGraph } from './roadGraph';

/**
 * Detects the player running a red light (spec fase 2 §6): entering the 16 × 16 m box around a signalised
 * intersection while the axis of the edge the player came from is red. Once per pass: a signal re-arms when
 * the player is more than 15 m away from it.
 */
export class RedLightDetector {
  private lastEdge: string | null = null;
  private inBox: string | null = null;
  private disarmed = new Set<string>();

  constructor(private g: RoadGraph) {}

  update(player: { x: number; z: number }, timeSec: number): boolean {
    const R = CONFIG.redLight;
    for (const id of this.disarmed) {
      const n = this.g.node(id);
      if (Math.hypot(player.x - n.x, player.z - n.z) > R.rearmM) this.disarmed.delete(id);
    }
    const box = this.g.signals.find((s) => {
      const n = this.g.node(s.nodeId);
      return Math.abs(player.x - n.x) < R.boxHalfM && Math.abs(player.z - n.z) < R.boxHalfM;
    });
    if (!box) {
      this.inBox = null;
      this.lastEdge = this.g.nearestEdge(player.x, player.z).edge.id;
      return false;
    }
    if (this.inBox === box.nodeId) return false;
    this.inBox = box.nodeId;
    if (this.disarmed.has(box.nodeId)) return false;
    this.disarmed.add(box.nodeId);
    if (!this.lastEdge) return false;
    const e = this.g.edge(this.lastEdge);
    if (e.from !== box.nodeId && e.to !== box.nodeId) return false;
    return signalLights(box, timeSec)[this.g.axisOf(e.id)] === 'red';
  }

  reset(): void { this.lastEdge = null; this.inBox = null; this.disarmed.clear(); }
}
