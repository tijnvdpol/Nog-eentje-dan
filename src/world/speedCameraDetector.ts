import { CONFIG } from '../config';
import type { FlashEvent } from '../core/events';
import type { RoadGraph } from './roadGraph';

interface CamState { prevSign: number | null; armed: boolean }

/**
 * Speed camera detection (spec fase 3 §4.2). A camera flashes once when the player crosses the line at its `s`
 * within the road width + margin, heading within 60° of the measured direction, above limit + tolerance.
 * It re-arms when the player is more than 50 m from the pole.
 */
export class SpeedCameraDetector {
  private state = new Map<string, CamState>();

  constructor(private g: RoadGraph) { this.reset(); }

  reset(): void {
    this.state.clear();
    for (const c of this.g.speedCameras) this.state.set(c.id, { prevSign: null, armed: true });
  }

  update(p: { x: number; z: number; heading: number; speedMs: number }): FlashEvent | null {
    const C = CONFIG.speedCamera;
    let flash: FlashEvent | null = null;
    for (const cam of this.g.speedCameras) {
      const st = this.state.get(cam.id)!;
      const e = this.g.edge(cam.edgeId);
      const a = this.g.node(e.from), b = this.g.node(e.to);
      const len = this.g.edgeLength(e.id);
      const ex = (b.x - a.x) / len, ez = (b.z - a.z) / len;
      const dx = p.x - a.x, dz = p.z - a.z;
      const along = dx * ex + dz * ez;
      const lateral = dx * -ez + dz * ex;
      const sign = Math.sign(along - cam.s) || 1;
      const crossed = st.prevSign !== null && sign !== st.prevSign;
      st.prevSign = sign;
      if (Math.hypot(along - cam.s, lateral) > C.rearmDistM) st.armed = true;
      if (!crossed || !st.armed || flash) continue;
      if (Math.abs(lateral) > e.lanesPerDir * CONFIG.traffic.laneWidthM + C.lateralMarginM) continue;
      const mv = Math.sign(p.speedMs);
      const cosAngle = mv * (Math.sin(p.heading) * ex + Math.cos(p.heading) * ez) * cam.dir;
      if (cosAngle < Math.cos((C.maxHeadingDeg * Math.PI) / 180)) continue;
      const kmh = Math.abs(p.speedMs) * 3.6;
      if (kmh <= e.speedLimitKmh + C.toleranceKmh) continue;
      st.armed = false;
      const speedKmh = Math.round(kmh);
      flash = { cameraId: cam.id, speedKmh, limitKmh: e.speedLimitKmh, kmhOver: speedKmh - e.speedLimitKmh };
    }
    return flash;
  }
}
