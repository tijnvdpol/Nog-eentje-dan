// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { Screens } from '../../src/ui/Screens';
import { Hud } from '../../src/ui/Hud';
import { crackSvg } from '../../src/ui/cracks';
let root: HTMLElement, s: Screens;
beforeEach(() => { document.body.innerHTML = '<div id="r"></div>'; root = document.getElementById('r')!; s = new Screens(root); });

it('start screen shows title, disclaimer, best score, M and two buttons', () => {
  const calls: string[] = [];
  s.showStart({ best: 4321, onStart: () => calls.push('start'), onSettings: () => calls.push('settings') });
  expect(root.textContent).toContain('Nog Eentje Dan');
  expect(root.textContent).toContain('Satire. Dit is precies waarom je dit nooit in het echt doet.');
  expect(root.textContent).toContain('4321'); expect(root.textContent).toContain('Geluid aan/uit');
  const [start, settings] = Array.from(root.querySelectorAll('button'));
  expect(start.textContent).toBe('Start'); expect(settings.textContent).toBe('Instellingen');
  start.click(); settings.click(); expect(calls).toEqual(['start', 'settings']);
});
it('start screen hides the best score when there is none', () => {
  s.showStart({ best: 0, onStart: () => {}, onSettings: () => {} });
  expect(root.textContent).not.toContain('Highscore');
});
it('mobile screen offers "Toch proberen"', () => {
  let tried = false; s.showMobile(() => (tried = true));
  expect(root.textContent).toContain('Nog Eentje Dan speel je op een laptop. Je hebt een toetsenbord nodig 🍻');
  expect(root.textContent).toContain('Satire.');
  (root.querySelector('.screen__link') as HTMLElement).click(); expect(tried).toBe(true);
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
  let st = false; s.showPause(() => {}, () => (st = true)); expect(root.textContent).toContain('Verder rijden');
  (root.querySelectorAll('button')[1] as HTMLButtonElement).click(); expect(st).toBe(true);
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
it('hud shows combo ×1 when the combo has run out', () => {
  const h = new Hud(root);
  const base = { score: 0, speedKmh: 0, damage: 0, promille: 0, multiplier: 1 };
  h.update({ ...base, combo: 1.5 }); expect(root.querySelector('.hud__combo')!.textContent).toBe('combo ×1,5');
  h.update({ ...base, combo: 1.25 }); expect(root.querySelector('.hud__combo')!.textContent).toBe('combo ×1,25');
  h.update({ ...base, combo: 1 }); expect(root.querySelector('.hud__combo')!.textContent).toBe('combo ×1');
});
it('crackSvg is deterministic and grows with level', () => {
  expect(crackSvg(25, 1)).toBe(crackSvg(25, 1));
  expect(crackSvg(75, 1).length).toBeGreaterThan(crackSvg(25, 1).length);
});

it('loading screen shows percentage and optional label', () => {
  s.showLoading(0.5, 'Wereld laden… 3/20');
  expect(root.innerHTML).toContain('50%'); expect(root.innerHTML).toContain('Wereld laden… 3/20');
  s.showLoading(1); expect(root.innerHTML).not.toContain('Wereld');
});
