// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { DestinationArrow } from '../../src/ui/DestinationArrow';

it('points at the target relative to the heading and shows the distance', () => {
  document.body.innerHTML = '<div id="r"></div>'; const root = document.getElementById('r')!;
  const a = new DestinationArrow(root); const el = root.querySelector('.dest-arrow') as HTMLElement;
  const icon = root.querySelector('.dest-arrow__icon') as HTMLElement;
  a.update({ x: 0, z: 100 }, { x: 0, z: 0, heading: 0 }); // straight ahead
  expect(el.hidden).toBe(false); expect(icon.style.transform).toBe('rotate(0deg)'); expect(el.textContent).toContain('100 m');
  a.update({ x: -50, z: 0 }, { x: 0, z: 0, heading: 0 }); // −x is the driver's right
  expect(icon.style.transform).toBe('rotate(90deg)');
  a.update({ x: 0, z: -10 }, { x: 0, z: 0, heading: 0 }); // behind
  expect(Math.abs(parseFloat(icon.style.transform.slice(7)))).toBeCloseTo(180);
  a.update(null, { x: 0, z: 0, heading: 0 }); expect(el.hidden).toBe(true);
});
