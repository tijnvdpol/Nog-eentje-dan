import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import './ui/ui.css';
import './phone/phone.css';
import { CONFIG } from './config';
import { EventBus, type GameEvents } from './core/events';
import { FixedStepLoop } from './core/loop';
import { BlackoutTimer, drunkEffects } from './drunk/effects';
import { Simulation } from './game/Simulation';
import { Input } from './input/input';
import { PedestrianView } from './pedestrians/PedestrianView';
import type { PedKind } from './pedestrians/pedestrianLogic';
import { Phone, type Post } from './phone/Phone';
import { Cockpit } from './render/Cockpit';
import { PostFX } from './render/PostFX';
import { Renderer } from './render/Renderer';
import { formatEndLines } from './stats/runStats';
import { GameSession } from './state/GameSession';
import { LocalHighscoreStore } from './storage/highscore';
import { TrafficView } from './traffic/TrafficView';
import { Hud } from './ui/Hud';
import { DestinationArrow } from './ui/DestinationArrow';
import { Screens } from './ui/Screens';
import { mulberry32 } from './util/rng';
import { PlayerCar } from './vehicle/PlayerCar';
import { buildCity } from './world/CityBuilder';
import { generateCityLayout } from './world/cityLayout';
import { RoadGraph } from './world/roadGraph';
import { SignalView } from './world/SignalView';
import type { RoadData } from './world/types';

const INTRO: [string, string][] = [
  ['Feestje 🍻', 'Bro waar ben je?? Kom je nog 🍺'],
  ['Swiep', 'Tip: druk Q om je telefoon te pakken'],
  ['Swiep', 'Dubbelklik = like. Meer likes = meer punten 🔥'],
  ['Feestje 🍻', 'Er staat nog een sixpack in je cupholder (E) 😉'],
];

const RED_LIGHT = [
  'Rood is ook maar een kleur 🔴', 'Stoplicht? Nooit van gehoord 😎', 'Groen, oranje, rood… allemaal mooi 🌈',
  'Wie remt, verliest 🏁', 'Dat was rood hè 😳 +punten', 'Regels zijn er om te breken 🚦',
];
const BEER_EMPTY = 'Bier op 😱 Haal een nieuwe sixpack bij de supermarkt of het feestje.';
const REFILLED = 'Sixpack gescoord 🍻';

const SCARED: Record<PedKind, [string, string]> = {
  jogger: ['Jogger Joyce', 'Kijk uit, gek! 🏃‍♀️'],
  student: ['Student Stijn', 'Bro, ik zat op mijn telefoon 📱'],
  oma: ['Oma Truus', 'ZAG JE MIJ NIET?! 👵'],
};

type Phase = 'menu' | 'playing' | 'paused' | 'over';

async function startGame(): Promise<void> {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const canvas = el<HTMLCanvasElement>('game');
  const screens = new Screens(el('screens'));
  const debug = new URLSearchParams(location.search).has('debug');

  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) { screens.showWebGLError(); return; }

  screens.showLoading(0);
  await RAPIER.init();
  screens.showLoading(0.33);
  const roads: RoadData = await (await fetch('content/roads.json')).json();
  screens.showLoading(0.66);
  const posts: Post[] = await (await fetch('content/posts.json')).json();
  const taskDefs: unknown[] = await fetch('content/tasks.json').then((r) => r.json()).catch(() => []);
  screens.showLoading(1);

  const graph = RoadGraph.fromData(roads);
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = CONFIG.loop.fixedDt;

  const renderer = new Renderer(canvas);
  buildCity(renderer.scene, world, graph, generateCityLayout(graph, CONFIG.world.seed));
  const cockpit = new Cockpit(renderer.camera);
  const post = new PostFX(renderer.gl, renderer.scene, renderer.camera);
  const trafficView = new TrafficView(renderer.scene, world);
  const signalView = new SignalView(renderer.scene, graph);
  const pedView = new PedestrianView(renderer.scene);

  const feestje = graph.places.find((p) => p.id === 'feestje')!;
  const spawn = { x: feestje.x - CONFIG.traffic.laneWidthM / 2, z: feestje.z, heading: 0 };
  const car = new PlayerCar(world, spawn);
  car.setOtherVelocityResolver((h) => trafficView.velocityOfCollider(h));

  const bus = new EventBus<GameEvents>();
  const input = new Input(window);
  const highscore = new LocalHighscoreStore();
  const hud = new Hud(el('hud'));
  const loop = new FixedStepLoop(CONFIG.loop.fixedDt, CONFIG.loop.maxFrameDt);
  const blackoutEl = el('blackout');
  const cupBtn = el<HTMLButtonElement>('cupholder');
  const rng = mulberry32((Date.now() & 0xffffffff) >>> 0);

  let session = new GameSession();
  let phone: Phone | null = null;
  const sim = new Simulation({ world, graph, car, trafficView, pedView, rng, bus, taskDefs, postIds: new Set(posts.map((p) => p.id)) });
  const arrow = new DestinationArrow(document.body);
  const cupCount = document.createElement('span');
  cupCount.className = 'cup__count';
  cupBtn.appendChild(cupCount);
  const refillPlaces = graph.places.filter((p) => p.id === 'supermarkt' || p.id === 'feestje');
  const beerPins = refillPlaces.map(() => {
    const pin = document.createElement('div');
    pin.className = 'beer-pin'; pin.textContent = '🍺'; pin.hidden = true;
    document.body.appendChild(pin);
    return pin;
  });
  let lastEmptyNotice = -Infinity;
  let blackout = new BlackoutTimer();
  let phase: Phase = 'menu';
  let introTimers: number[] = [];

  bus.on('like', ({ postId }) => { session.like(postId, sim.timeSec); sim.likedPost(postId); });
  bus.on('redLight', () => { phone?.notify('🚦', RED_LIGHT[Math.floor(rng() * RED_LIGHT.length) % RED_LIGHT.length]); });
  bus.on('refilled', () => { phone?.notify('🍺', REFILLED); });
  bus.on('beerEmpty', () => { phone?.notify('🍺', BEER_EMPTY); });
  bus.on('taskStarted', ({ taskId }) => {
    const def = sim.tasks.defs.find((d) => d.id === taskId);
    if (!def || !phone) return;
    phone.notify(def.from, def.text);
    if (def.type === 'chat') phone.showChat(def.from, def.text, def.answers, (i) => sim.answerTask(i));
    else if (def.type === 'like') phone.injectPost(def.postId, CONFIG.tasks.likeWithinPosts);
  });
  bus.on('taskResolved', ({ taskId, reply }) => {
    const def = sim.tasks.defs.find((d) => d.id === taskId);
    phone?.closeChat();
    if (def) phone?.notify(def.from, reply);
  });
  bus.on('horn', () => { console.debug('horn'); });
  bus.on('nearMiss', ({ kind }) => { phone?.notify(...SCARED[kind]); });
  car.onImpact((kmh) => {
    const levels = session.impact(kmh);
    if (levels.length) { hud.showCracks(levels); bus.emit('cracks', { levels }); }
  });

  function drink(): void {
    if (phase !== 'playing') return;
    if (session.startDrink()) { bus.emit('drinkStarted', {}); return; }
    if (session.beersLeft === 0 && sim.timeSec - lastEmptyNotice >= CONFIG.beer.emptyNoticeCooldownSec) {
      lastEmptyNotice = sim.timeSec;
      bus.emit('beerEmpty', {});
    }
  }
  cupBtn.addEventListener('click', drink);

  function newRun(): void {
    introTimers.forEach(clearTimeout); introTimers = [];
    session = new GameSession();
    lastEmptyNotice = -Infinity;
    car.teleport(spawn);
    sim.reset();
    blackout = new BlackoutTimer();
    blackoutEl.classList.remove('on');
    phone?.dispose();
    phone = new Phone(el('phone'), posts, bus, rng);
    hud.reset();
    loop.reset();
    screens.hide();
    phase = 'playing';
    INTRO.forEach(([from, text], i) => introTimers.push(window.setTimeout(() => {
      phone?.notify(from, text);
      // the first task comes 20 s (simulated) after the last intro message
      if (i === INTRO.length - 1) sim.tasks.start(sim.timeSec);
    }, 1000 + i * 4000)));
  }

  function pause(): void {
    if (phase !== 'playing') return;
    phase = 'paused';
    screens.showPause(resume);
  }
  function resume(): void {
    if (phase !== 'paused') return;
    phase = 'playing';
    screens.hide();
    loop.reset();
    last = performance.now();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('resize', () => { renderer.resize(); post.resize(window.innerWidth, window.innerHeight); });
  if (debug) {
    window.addEventListener('keydown', (e) => {
      const v = ({ Digit1: 0.3, Digit2: 0.9, Digit3: 1.9, Digit4: 2.75 } as Record<string, number>)[e.code];
      if (v !== undefined) session.debugSetPromille(v);
    });
  }

  function finishRun(): void {
    phase = 'over';
    phone?.setUp(false);
    const { best, isNew } = highscore.submit(session.score);
    bus.emit('gameOver', { reason: session.over! });
    screens.showGameOver(
      { reason: session.over!, score: session.score, best, isNew, lines: formatEndLines(session.stats) },
      newRun,
    );
  }

  const projected = new THREE.Vector3();

  /** Task timer, destination arrow, cupholder count and the beer pins above the refill places. */
  function updateTaskUi(): void {
    const inRun = phase === 'playing' || phase === 'paused';
    const active = inRun ? sim.tasks.active : null;
    phone?.setTaskTimer(active ? active.fraction : null);
    const def = active?.def;
    const target = def?.type === 'destination' ? graph.places.find((p) => p.id === def.target) ?? null : null;
    arrow.update(target, car.state);
    cupCount.textContent = String(session.beersLeft);
    cupCount.classList.toggle('cup__count--empty', session.beersLeft === 0);
    const lowStock = session.beersLeft <= CONFIG.beer.iconAtOrBelow;
    refillPlaces.forEach((place, i) => {
      const pin = beerPins[i];
      const near = Math.hypot(place.x - car.state.x, place.z - car.state.z) <= CONFIG.beer.refillRadiusM;
      const progress = near ? session.refillProgress : 0;
      projected.set(place.x, 5, place.z).project(renderer.camera);
      pin.hidden = !inRun || !(lowStock || progress > 0) || projected.z > 1;
      if (pin.hidden) return;
      pin.style.left = `${((projected.x + 1) / 2) * 100}%`;
      pin.style.top = `${((1 - projected.y) / 2) * 100}%`;
      pin.style.setProperty('--p', progress.toFixed(3));
    });
  }
  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0;

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, 1);
    last = now;

    if (phase === 'playing') {
      if (input.consumePressed('pause')) pause();
      if (input.consumePressed('togglePhone')) phone?.setUp(!phone.isUp());
      if (input.consumePressed('drink')) drink();
    } else if (phase === 'paused') {
      if (input.consumePressed('pause')) resume();
      input.consumePressed('togglePhone'); input.consumePressed('drink');
    } else {
      input.consumePressed('pause'); input.consumePressed('togglePhone'); input.consumePressed('drink');
    }

    const fx = drunkEffects(session.promille);
    if (phase === 'playing') {
      const steps = loop.advance(frameDt);
      const drive = input.drive();
      for (let i = 0; i < steps && phase === 'playing'; i++) {
        sim.step(CONFIG.loop.fixedDt, drive, session, phone?.isUp() ?? false);
        if (session.over) { finishRun(); break; }
      }
      blackoutEl.classList.toggle('on', blackout.update(frameDt, fx.blackoutPerSec, rng));
      phone?.applyEffects(fx);
      hud.update({ score: session.score, speedKmh: car.speedKmh, damage: session.damage, promille: session.promille, multiplier: session.multiplier, combo: session.comboAt(sim.timeSec) });
    }

    // camera follows the car (driver sits on the left)
    const { x, z, heading } = car.state;
    const fx_ = Math.sin(heading), fz_ = Math.cos(heading);
    renderer.camera.position.set(x + fx_ * 0.2 + fz_ * 0.35, 1.2, z + fz_ * 0.2 - fx_ * 0.35);
    renderer.camera.rotation.set(0, heading + Math.PI, 0);
    cockpit.update(sim.lastSteer, session.drinkProgress);
    signalView.update(sim.timeSec);
    post.apply(phase === 'playing' || phase === 'paused' ? fx : drunkEffects(0), sim.timeSec);
    post.render();

    cupBtn.style.display = phase === 'playing' ? 'block' : 'none';
    if (phase === 'playing') {
      renderer.camera.updateMatrixWorld(true);
      cockpit.canWorldPosition(projected).project(renderer.camera);
      cupBtn.style.left = `${((projected.x + 1) / 2) * 100}%`;
      cupBtn.style.top = `${((1 - projected.y) / 2) * 100}%`;
      cupBtn.style.bottom = 'auto';
      cupBtn.style.transform = 'translate(-50%, -50%)';
    }
    updateTaskUi();

    if (debug) {
      fpsAcc += frameDt; fpsFrames++;
      if (fpsAcc >= 0.5) { hud.showFps(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
    }
  }

  hud.reset();
  screens.showStart(newRun);
  requestAnimationFrame(frame);
  (window as unknown as { __nogEentjeDan?: unknown }).__nogEentjeDan = debug ? { get session() { return session; }, car, sim } : undefined;
}

startGame().catch((err) => {
  console.error(err);
  const s = document.getElementById('screens');
  if (s) s.innerHTML = '<div class="screen"><div class="screen__box"><h2>Oeps</h2><p>Er ging iets mis bij het laden van de game.</p></div></div>';
});
