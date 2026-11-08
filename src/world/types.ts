import type { Zone } from '../config';

export interface RoadNode { id: string; x: number; z: number }
export type RoadKind = 'stad' | 'ring' | 'oprit' | 'nweg' | 'dorp';
export interface RoadEdge { id: string; from: string; to: string; lanesPerDir: number; speedLimitKmh: number; zone: Zone; kind: RoadKind }
export interface Place { id: 'feestje' | 'snackbar' | 'supermarkt' | 'huis'; name: string; x: number; z: number }
export interface SignalSpec { nodeId: string; offsetSec: number }
/** A zebra crossing on `edgeId`, centred `s` metres from the edge's `from` node. */
export interface Crossing { id: string; edgeId: string; s: number }
export interface RoadData { nodes: RoadNode[]; edges: RoadEdge[]; places: Place[]; signals: SignalSpec[]; crossings: Crossing[] }
/** RoadData as accepted by RoadGraph.fromData: hand-made test graphs may leave out signals and crossings. */
export type RoadDataInput = Omit<RoadData, 'signals' | 'crossings'> & Partial<Pick<RoadData, 'signals' | 'crossings'>>;
export interface BuildingSpec { x: number; z: number; w: number; d: number; h: number; color: number }
