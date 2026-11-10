/** Fixed camera poses for `?shot=<id>` (screenshots and render-budget measurements). heading: forward = (sin h, cos h). */
export interface Shot { id: string; x: number; z: number; heading: number; promille: number; cockpit: boolean; measure: boolean }

const H = Math.PI / 2;
const s = (id: string, x: number, z: number, heading: number, extra: Partial<Shot> = {}): Shot =>
  ({ id, x, z, heading, promille: 0, cockpit: true, measure: false, ...extra });

export const SHOTS: readonly Shot[] = [
  // block with corner (-200,-200): along its north street, along its east street, diagonal from the corner
  s('proef-1', -230, -199, H),
  s('proef-2', -99, -250, 0),
  s('proef-3', -215, -215, Math.PI / 4),
  // block with corner (-100,-200)
  s('kenney-1', -130, -199, H),
  s('kenney-2', 1, -250, 0),
  s('kenney-3', -115, -215, Math.PI / 4),
  // village street (z = 0, x 2500..2800), cafe at (2700,18), church at (2850,0)
  s('dorp-1', 2620, 0, H),
  s('dorp-2', 2670, 0, 1.03),
  s('kerk-1', 2780, 0, H),
  s('cockpit-0', -230, -199, H),
  s('cockpit-15', -230, -199, H, { promille: 1.5 }),
  s('meet-stad', 0, -50, 0, { measure: true }),
  s('meet-ring', 627.7, 124.9, -0.294, { measure: true }),
  s('meet-nweg', 1075, 20, 1.41, { measure: true }),
  s('meet-dorp', 2650, 0, H, { measure: true }),
];

export function shotById(id: string): Shot | undefined { return SHOTS.find((x) => x.id === id); }
