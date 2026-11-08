import type { Zone } from '../config';

export interface RoadNode { id: string; x: number; z: number }
export interface RoadEdge { id: string; from: string; to: string; lanesPerDir: number; speedLimitKmh: number; zone: Zone }
export interface Place { id: 'feestje' | 'snackbar' | 'supermarkt' | 'huis'; name: string; x: number; z: number }
export interface RoadData { nodes: RoadNode[]; edges: RoadEdge[]; places: Place[] }
export interface BuildingSpec { x: number; z: number; w: number; d: number; h: number; color: number }
