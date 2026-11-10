import type { ModelIndexEntry, ModelRole } from '../src/models/roles';

export type KenneyPack = 'car-kit' | 'city-kit-suburban' | 'city-kit-commercial' | 'city-kit-roads' | 'nature-kit';
export type ManifestEntry = { pack: KenneyPack; path: string } & Omit<ModelIndexEntry, 'file' | 'size'>;

const CAR = { w: 1.8, d: 4.4 };
const HOUSE = { w: 8, d: 9 }; // CONFIG.village.houseW / houseD
const TREE = { h: 6.5 };
const car = (file: string): ManifestEntry => ({ pack: 'car-kit', path: `Models/GLB format/${file}.glb`, target: CAR });
const house = (letter: string): ManifestEntry => ({ pack: 'city-kit-suburban', path: `Models/GLB format/building-type-${letter}.glb`, target: HOUSE });
const tree = (name: string): ManifestEntry => ({ pack: 'nature-kit', path: `Models/GLTF format/${name}.glb`, target: TREE });
const proef = (letter: string): ManifestEntry => ({ pack: 'city-kit-commercial', path: `Models/GLB format/building-${letter}.glb` });

// All Kenney GLBs use one shared colormap material, so no bodyMaterial/glassColors are known.
export const MANIFEST: Record<ModelRole, ManifestEntry> = {
  'car.hatchback': car('hatchback-sports'), 'car.sedan': car('sedan'), 'car.suv': car('suv'),
  'car.van': car('van'), 'car.delivery': car('delivery'), 'car.taxi': car('taxi'),
  'house.a': house('a'), 'house.b': house('e'), 'house.c': house('h'), 'house.d': house('i'),
  'prop.fence': { pack: 'city-kit-suburban', path: 'Models/GLB format/fence-low.glb' },
  'prop.hedge': { pack: 'nature-kit', path: 'Models/GLTF format/plant_bush.glb' },
  'prop.awning': { pack: 'city-kit-commercial', path: 'Models/GLB format/detail-awning.glb' },
  'prop.lamp': { pack: 'city-kit-roads', path: 'Models/GLB format/light-square.glb', target: { h: 6 } },
  'tree.a': tree('tree_oak'), 'tree.b': tree('tree_default'), 'tree.c': tree('tree_detailed'),
  'proef.a': proef('i'), 'proef.b': proef('l'), 'proef.c': proef('f'),
};

/** Finds the unpacked pack folder (e.g. `kenney_city-kit-roads_2.0`) for a pack slug. */
export function findPackDir(dirNames: readonly string[], pack: KenneyPack): string | null {
  return dirNames.find((d) => d.includes(pack)) ?? null;
}
