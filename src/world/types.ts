import type { Zone } from '../config';

export interface RoadNode { id: string; x: number; z: number }
export type RoadKind = 'stad' | 'ring' | 'oprit' | 'nweg' | 'dorp';
export interface RoadEdge { id: string; from: string; to: string; lanesPerDir: number; speedLimitKmh: number; zone: Zone; kind: RoadKind }
export interface Place { id: 'feestje' | 'snackbar' | 'supermarkt' | 'huis' | 'tankstation' | 'dorpscafe'; name: string; x: number; z: number }
export interface SignalSpec { nodeId: string; offsetSec: number }
/** A zebra crossing on `edgeId`, centred `s` metres from the edge's `from` node. */
export interface Crossing { id: string; edgeId: string; s: number }
/** A speed camera on `edgeId`, `s` metres from the `from` node; `dir: 1` measures traffic running from → to. */
export interface SpeedCamera { id: string; edgeId: string; s: number; dir: 1 | -1 }
export interface RoadData { nodes: RoadNode[]; edges: RoadEdge[]; places: Place[]; signals: SignalSpec[]; crossings: Crossing[]; speedCameras: SpeedCamera[] }
/** RoadData as accepted by RoadGraph.fromData: hand-made test graphs may leave out signals and crossings. */
export type RoadDataInput = Omit<RoadData, 'signals' | 'crossings' | 'speedCameras'> & Partial<Pick<RoadData, 'signals' | 'crossings' | 'speedCameras'>>;
export interface BuildingSpec { x: number; z: number; w: number; d: number; h: number; color: number }
