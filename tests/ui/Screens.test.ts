// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { Screens } from '../../src/ui/Screens';
import { Hud } from '../../src/ui/Hud';
import { crackSvg } from '../../src/ui/cracks';
let root: HTMLElement, s: Screens;
beforeEach(() => { document.body.innerHTML = '<div id="r"></div>'; root = document.getElementById('r')!; s = new Screens(root); });

it('start screen shows title and disclaimer', () => {
  s.showStart(() => {});
  expect(root.textContent).toContain('Nog Eentje Dan');
  expect(root.textContent).toContain('Satire. Dit is precies waarom je dit nooit in het echt doet.');
});
it('game over shows reason, lines, score and restart', () => {
  let restarted = false;
  s.showGameOver({ reason: 'passedOut', score: 1234, best: 1234, isNew: true, lines: ['Je keek 47 seconden niet naar de weg.'] }, () => (restarted = true));
  expect(root.textContent).toContain('Je bent in slaap gevallen achter het stuur.');
  expect(root.textContent).toContain('Nieuwe highscore!');
  expect(root.textContent).toContain('Je keek 47 seconden niet naar de weg.');
  (root.querySelector('button') as HTMLButtonElement).click(); expect(restarted).toBe(true);
});
it('wrecked reason text', () => {
  s.showGameOver({ reason: 'wrecked', score: 0, best: 10, isNew: false, lines: [] }, () => {});
  expect(root.textContent).toContain('Je auto is total loss.');
  expect(root.textContent).not.toContain('Nieuwe highscore!');
});
it('pause, webgl error and hide', () => {
  s.showPause(() => {}); expect(root.textContent).toContain('Verder rijden');
  s.showWebGLError(); expect(root.textContent).toContain('Je browser ondersteunt geen WebGL');
  s.hide(); expect(root.textContent).toBe('');
});
it('hud formats with Dutch decimal comma', () => {
  const h = new Hud(root);
  h.update({ score: 12, speedKmh: 87.4, damage: 33.2, promille: 1.234, multiplier: 2.25, combo: 1.5 });
  expect(root.textContent).toContain('1,23'); expect(root.textContent).toContain('×2,3');
  h.showCracks([25, 50]); expect(root.querySelectorAll('.hud__crack').length).toBe(2);
  h.reset(); expect(root.querySelectorAll('.hud__crack').length).toBe(0);
});
it('crackSvg is deterministic and grows with level', () => {
  expect(crackSvg(25, 1)).toBe(crackSvg(25, 1));
  expect(crackSvg(75, 1).length).toBeGreaterThan(crackSvg(25, 1).length);
});
