import type { Zone } from '../config';
import type { Crossing, Place, RoadDataInput, RoadEdge, RoadKind, RoadNode, SignalSpec } from './types';

export type Axis = 'nz' | 'ow';

export class RoadGraph {
  private nodeMap = new Map<string, RoadNode>();
  private edgeMap = new Map<string, RoadEdge>();
  private lengths = new Map<string, number>();
  private byNode = new Map<string, RoadEdge[]>();
  readonly edges: readonly RoadEdge[];
  readonly places: readonly Place[];
  readonly nodes: readonly RoadNode[];
  readonly signals: readonly SignalSpec[];
  readonly crossings: readonly Crossing[];
  private signalMap = new Map<string, SignalSpec>();
  private ringNodes = new Set<string>();

  private constructor(d: RoadDataInput) {
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
      if (e.kind === 'ring') { this.ringNodes.add(e.from); this.ringNodes.add(e.to); }
    }
    this.edges = d.edges;
    this.places = d.places;
    this.nodes = d.nodes;
    this.signals = d.signals ?? [];
    this.crossings = d.crossings ?? [];
    for (const sig of this.signals) {
      if (!this.nodeMap.has(sig.nodeId)) throw new Error(`Signal on unknown node ${sig.nodeId}`);
      this.signalMap.set(sig.nodeId, sig);
    }
    for (const c of this.crossings) {
      const len = this.lengths.get(c.edgeId);
      if (len === undefined) throw new Error(`Crossing ${c.id} on unknown edge ${c.edgeId}`);
      if (!(c.s >= 0 && c.s <= len)) throw new Error(`Crossing ${c.id} outside edge ${c.edgeId}`);
    }
  }

  static fromData(d: RoadDataInput): RoadGraph { return new RoadGraph(d); }

  signalAt(nodeId: string): SignalSpec | undefined { return this.signalMap.get(nodeId); }

  edgesOfKind(kind: RoadKind): readonly RoadEdge[] { return this.edges.filter((e) => e.kind === kind); }

  /** True when an adjacent edge is part of the ring road. */
  isRingNode(nodeId: string): boolean { return this.ringNodes.has(nodeId); }

  /** A node where traffic needs right of way: >= 3 edges and not part of the ring. */
  isIntersection(nodeId: string): boolean {
    return !this.isRingNode(nodeId) && this.edgesAt(nodeId).length >= 3;
  }

  /** 'ow' (east-west) when the edge runs mostly along x, otherwise 'nz'. */
  axisOf(edgeId: string): Axis {
    const e = this.edge(edgeId);
    const a = this.node(e.from), b = this.node(e.to);
    return Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? 'ow' : 'nz';
  }

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
