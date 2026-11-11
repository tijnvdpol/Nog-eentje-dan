export type CarRole = 'car.hatchback' | 'car.sedan' | 'car.suv' | 'car.van' | 'car.delivery' | 'car.taxi';
export type HouseRole = 'house.a' | 'house.b' | 'house.c' | 'house.d';
export type ModelRole =
  | CarRole | HouseRole
  | 'prop.fence' | 'prop.hedge' | 'prop.awning' | 'prop.lamp'
  | 'tree.a' | 'tree.b' | 'tree.c';

export const MODEL_ROLES: readonly ModelRole[] = [
  'car.hatchback', 'car.sedan', 'car.suv', 'car.van', 'car.delivery', 'car.taxi',
  'house.a', 'house.b', 'house.c', 'house.d',
  'prop.fence', 'prop.hedge', 'prop.awning', 'prop.lamp',
  'tree.a', 'tree.b', 'tree.c',
];

export interface FallbackShape { shape: 'box' | 'cone' | 'cylinder'; w: number; d: number; h: number; color: number }

const car = (color: number): FallbackShape => ({ shape: 'box', w: 1.8, d: 4.4, h: 1.4, color });
const house = (color: number): FallbackShape => ({ shape: 'box', w: 8, d: 9, h: 4, color });
const tree: FallbackShape = { shape: 'cone', w: 3.2, d: 3.2, h: 6.5, color: 0x1f5a2c };

/** Shown while a model loads or when it is missing; follows the old placeholder shapes. */
export const FALLBACKS: Record<ModelRole, FallbackShape> = {
  'car.hatchback': car(0xc0392b), 'car.sedan': car(0xc0392b), 'car.suv': car(0xc0392b),
  'car.van': car(0xc0392b), 'car.delivery': car(0xc0392b), 'car.taxi': car(0xc0392b),
  'house.a': house(0xc9b48a), 'house.b': house(0xb8896a), 'house.c': house(0xd8d0c0), 'house.d': house(0x9fb0a0),
  'prop.fence': { shape: 'box', w: 1.6, d: 0.1, h: 0.9, color: 0xb9b2a4 },
  'prop.hedge': { shape: 'box', w: 1.4, d: 1.4, h: 0.9, color: 0x2f4a2f },
  'prop.awning': { shape: 'box', w: 3, d: 1.2, h: 0.2, color: 0x8a4a3a },
  'prop.lamp': { shape: 'cylinder', w: 0.2, d: 0.2, h: 6, color: 0x555a63 },
  'tree.a': tree, 'tree.b': tree, 'tree.c': tree,
};

export interface ModelIndexEntry {
  file: string;
  size: { w: number; d: number; h: number };
  target?: { w?: number; d?: number; h?: number };
  yawOffset?: number;
  /** Scale each target axis independently (h by the mean of the w and d ratios) instead of uniformly. */
  stretch?: boolean;
  bodyMaterial?: string;
  glassColors?: string[];
}
export type ModelIndex = Partial<Record<ModelRole, ModelIndexEntry>>;
