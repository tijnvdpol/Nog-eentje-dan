import { CONFIG } from '../config';
import type { CarRole } from '../models/roles';
import { mulberry32 } from '../util/rng';

/** Paint palette (the former box colours). */
export const CAR_COLORS = [0xc0392b, 0x2980b9, 0xd4ac0d, 0xecf0f1, 0x27ae60];

/** Which model a traffic car uses, and its paint (null = the model's own colour, as for the taxi). */
export function carLook(id: number): { role: CarRole; color: number | null } {
  const r = mulberry32(id * 2654435761)();
  let acc = 0, role: CarRole = 'car.hatchback';
  for (const [name, share] of Object.entries(CONFIG.carLooks.mix)) {
    acc += share; role = `car.${name}` as CarRole;
    if (r < acc) break;
  }
  const color = role === 'car.taxi' ? null : CAR_COLORS[Math.floor(mulberry32(id * 40503 + 7)() * CAR_COLORS.length)];
  return { role, color };
}
