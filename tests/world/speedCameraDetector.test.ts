import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { SpeedCameraDetector } from '../../src/world/speedCameraDetector';
import { RoadGraph } from '../../src/world/roadGraph';

const g = RoadGraph.fromData(buildRoadData());

/** Drive along an edge in 0.5 m steps from s=fromS to s=toS, `lateral` m to the right of the edge direction. */
function drive(det: SpeedCameraDetector, edgeId: string, lateral: number, dirSign: 1 | -1, kmh: number, fromS: number, toS: number) {
  const e = g.edge(edgeId), a = g.node(e.from), b = g.node(e.to), len = g.edgeLength(edgeId);
  const ex = (b.x - a.x) / len, ez = (b.z - a.z) / len;
  const heading = Math.atan2(ex * dirSign, ez * dirSign);
  const out: NonNullable<ReturnType<SpeedCameraDetector['update']>>[] = [];
  const n = Math.round(Math.abs(toS - fromS) / 0.5);
  for (let i = 0; i <= n; i++) {
    const s = fromS + ((toS - fromS) * i) / n;
    const f = det.update({ x: a.x + ex * s - ez * lateral, z: a.z + ez * s + ex * lateral, heading, speedMs: kmh / 3.6 });
    if (f) out.push(f);
  }
  return out;
}
const len = (id: string) => g.edgeLength(id);
const half = (id: string) => len(id) / 2;

it('flashes once when passing above limit + 4 in the measured direction', () => {
  const det = new SpeedCameraDetector(g);
  expect(drive(det, 'nw2', 1.75, 1, 85, 0, len('nw2'))).toEqual([{ cameraId: 'fl_nweg_heen', speedKmh: 85, limitKmh: 80, kmhOver: 5 }]);
});
it('does not flash at exactly limit + 4', () => expect(drive(new SpeedCameraDetector(g), 'nw2', 1.75, 1, 84, 0, len('nw2'))).toEqual([]));
it('does not flash in the other direction', () => expect(drive(new SpeedCameraDetector(g), 'nw2', -1.75, -1, 120, len('nw2'), 0)).toEqual([]));
it('flashes the return camera only when driving towards the city', () => {
  expect(drive(new SpeedCameraDetector(g), 'nw5', -1.75, -1, 100, len('nw5'), 0).map((f) => f.cameraId)).toEqual(['fl_nweg_terug']);
  expect(drive(new SpeedCameraDetector(g), 'nw5', 1.75, 1, 100, 0, len('nw5'))).toEqual([]);
});
it('does not flash beside the road', () => expect(drive(new SpeedCameraDetector(g), 'nw2', 3.5 + 2 + 0.5, 1, 120, 0, len('nw2'))).toEqual([]));
it('flashes on the ring left lane too', () => expect(drive(new SpeedCameraDetector(g), 'ring4', 5.25, 1, 150, 0, len('ring4')).length).toBe(1));
it('does not flash a reversing player or a sideways crossing', () => {
  const e = g.edge('nw2'), a = g.node(e.from), b = g.node(e.to), L = len('nw2');
  const det = new SpeedCameraDetector(g);
  const ex = (b.x - a.x) / L, ez = (b.z - a.z) / L;
  // heading along the road but negative speed = moving against the measured direction
  const out = [];
  for (let s = 0; s <= L; s += 0.5) { const f = det.update({ x: a.x + ex * s - ez * 1.75, z: a.z + ez * s + ex * 1.75, heading: Math.atan2(ex, ez), speedMs: -30 }); if (f) out.push(f); }
  expect(out).toEqual([]);
});
it('re-arms only after 50 m; reset re-arms', () => {
  const det = new SpeedCameraDetector(g), c = half('nw2');
  expect(drive(det, 'nw2', 1.75, 1, 90, 0, c + 30).length).toBe(1);        // pass, stop 30 m behind the pole
  expect(drive(det, 'nw2', 1.75, -1, 10, c + 30, c - 30).length).toBe(0);  // back to 30 m before it
  expect(drive(det, 'nw2', 1.75, 1, 90, c - 30, c + 30).length).toBe(0);   // pass again: still disarmed
  expect(drive(det, 'nw2', 1.75, -1, 10, c + 30, c - 60).length).toBe(0);  // 60 m before the pole: re-armed
  expect(drive(det, 'nw2', 1.75, 1, 90, c - 60, c + 30).length).toBe(1);
  det.reset();
  expect(drive(det, 'nw2', 1.75, 1, 90, c - 30, c + 30).length).toBe(1);   // right after reset the pole is armed again
});
