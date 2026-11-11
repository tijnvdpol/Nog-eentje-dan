import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SHOTS, shotById } from '../../src/debug/shots';
import { RoadGraph } from '../../src/world/roadGraph';

const g = RoadGraph.fromData(JSON.parse(readFileSync('public/content/roads.json', 'utf8')));

it('SHOTS ids are unique and include the review set', () => {
  const ids = SHOTS.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ['proef-1', 'proef-2', 'proef-3', 'dorp-1', 'dorp-2', 'kerk-1',
    'cockpit-0', 'cockpit-15', 'meet-stad', 'meet-ring', 'meet-nweg', 'meet-dorp', 'verkeer-1']) expect(ids).toContain(id);
  expect(shotById('proef-1')?.id).toBe('proef-1');
  expect(shotById('bestaat-niet')).toBeUndefined();
  expect(ids.some((id) => id.startsWith('kenney-'))).toBe(false);
});

it('verkeer-1 runs traffic from a cockpit pose', () => {
  const v = shotById('verkeer-1')!;
  expect(v.traffic).toBe(true);
  expect(v.cockpit).toBe(true);
  expect(v.promille).toBe(0);
});

it('measure shots lie on the road', () => {
  const measured = SHOTS.filter((s) => s.measure);
  expect(measured.length).toBe(4);
  for (const s of measured) expect(g.nearestEdge(s.x, s.z).distance).toBeLessThan(4);
});
