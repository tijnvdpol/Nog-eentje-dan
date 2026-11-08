import type { Zone } from '../config';
import type { Place, RoadData, RoadEdge, RoadNode } from './types';

export class RoadGraph {
  private nodeMap = new Map<string, RoadNode>();
  private edgeMap = new Map<string, RoadEdge>();
  private lengths = new Map<string, number>();
  private byNode = new Map<string, RoadEdge[]>();
  readonly edges: readonly RoadEdge[];
  readonly places: readonly Place[];
  readonly nodes: readonly RoadNode[];

  private constructor(d: RoadData) {
    for (const n of d.nodes) {
      if (this.nodeMap.has(n.id)) throw new Error(`Duplicate node id ${n.id}`);
      this.nodeMap.set(n.id, n);
      this.byNode.set(n.id, []);
    }
    for (const e of d.edges) {
      if (this.edgeMap.has(e.id)) throw new Error(`Duplicate edge id ${e.id}`);
      const a = this.nodeMap.get(e.from), b = this.nodeMap.get(e.to);
      if (!a || !b) throw new Error(`Edge ${e.id} references unknown node`);
      this.edgeMap.set(e.id, e);
      this.lengths.set(e.id, Math.hypot(b.x - a.x, b.z - a.z));
      this.byNode.get(e.from)!.push(e);
      this.byNode.get(e.to)!.push(e);
    }
    this.edges = d.edges;
    this.places = d.places;
    this.nodes = d.nodes;
  }

  static fromData(d: RoadData): RoadGraph { return new RoadGraph(d); }

  node(id: string): RoadNode {
    const n = this.nodeMap.get(id);
    if (!n) throw new Error(`Unknown node ${id}`);
    return n;
  }
  edge(id: string): RoadEdge {
    const e = this.edgeMap.get(id);
    if (!e) throw new Error(`Unknown edge ${id}`);
    return e;
  }
  edgeLength(id: string): number { return this.lengths.get(id)!; }
  edgesAt(nodeId: string): RoadEdge[] { return this.byNode.get(nodeId) ?? []; }

  nearestEdge(x: number, z: number): { edge: RoadEdge; distance: number; t: number } {
    let best: { edge: RoadEdge; distance: number; t: number } | null = null;
    for (const e of this.edges) {
      const a = this.nodeMap.get(e.from)!, b = this.nodeMap.get(e.to)!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const dist = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
      if (!best || dist < best.distance) best = { edge: e, distance: dist, t };
    }
    if (!best) throw new Error('Graph has no edges');
    return best;
  }

  zoneAt(x: number, z: number): { zone: Zone; speedLimitKmh: number } {
    const { edge } = this.nearestEdge(x, z);
    return { zone: edge.zone, speedLimitKmh: edge.speedLimitKmh };
  }
}
