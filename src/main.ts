import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import './ui/ui.css';
import './phone/phone.css';
import { CONFIG } from './config';
import { EventBus, type GameEvents } from './core/events';
import { FixedStepLoop } from './core/loop';
import { BlackoutTimer, drunkEffects } from './drunk/effects';
import { DrunkInputFilter } from './input/drunkInputFilter';
import { Input, type DriveInput } from './input/input';
import { Phone, type Post } from './phone/Phone';
import { Cockpit } from './render/Cockpit';
import { PostFX } from './render/PostFX';
import { Renderer } from './render/Renderer';
import { formatEndLines } from './stats/runStats';
import { GameSession } from './state/GameSession';
import { LocalHighscoreStore } from './storage/highscore';
import { TrafficManager } from './traffic/trafficLogic';
import { TrafficView } from './traffic/TrafficView';
import { Hud } from './ui/Hud';
import { Screens } from './ui/Screens';
import { mulberry32 } from './util/rng';
import { PlayerCar } from './vehicle/PlayerCar';
import { buildCity } from './world/CityBuilder';
import { generateCityLayout } from './world/cityLayout';
import { RoadGraph } from './world/roadGraph';
import type { RoadData } from './world/types';

const INTRO: [string, string][] = [
  ['Feestje 🍻', 'Bro waar ben je?? Kom je nog 🍺'],
  ['Swiep', 'Tip: druk Q om je telefoon te pakken'],
  ['Swiep', 'Dubbelklik = like. Meer likes = meer punten 🔥'],
  ['Feestje 🍻', 'Er staat nog een biertje in je cupholder (E) 😉'],
];

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
  screens.showLoading(1);

  const graph = RoadGraph.fromData(roads);
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = CONFIG.loop.fixedDt;

  const renderer = new Renderer(canvas);
  buildCity(renderer.scene, world, graph, generateCityLayout(graph, CONFIG.world.seed));
  const cockpit = new Cockpit(renderer.camera);
  const post = new PostFX(renderer.gl, renderer.scene, renderer.camera);
  const trafficView = new TrafficView(renderer.scene, world);

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
  let traffic = new TrafficManager(graph, rng);
  let filter = new DrunkInputFilter(rng);
  let blackout = new BlackoutTimer();
  let phase: Phase = 'menu';
  let gameTime = 0;
  let lastSteer = 0;
  let introTimers: number[] = [];

  bus.on('like', ({ postId }) => { session.like(postId, gameTime); });
  car.onImpact((kmh) => {
    const levels = session.impact(kmh);
    if (levels.length) { hud.showCracks(levels); bus.emit('cracks', { levels }); }
  });

  function drink(): void { if (phase === 'playing' && session.startDrink()) bus.emit('drinkStarted', {}); }
  cupBtn.addEventListener('click', drink);

  function newRun(): void {
    introTimers.forEach(clearTimeout); introTimers = [];
    session = new GameSession();
    car.teleport(spawn);
    traffic.clear(); traffic = new TrafficManager(graph, rng);
    filter = new DrunkInputFilter(rng);
    blackout = new BlackoutTimer();
    blackoutEl.classList.remove('on');
    phone?.dispose();
    phone = new Phone(el('phone'), posts, bus, rng);
    hud.reset();
    gameTime = 0;
    loop.reset();
    screens.hide();
    phase = 'playing';
    INTRO.forEach(([from, text], i) => introTimers.push(window.setTimeout(() => phone?.notify(from, text), 1000 + i * 4000)));
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

  function simulate(dt: number, drive: DriveInput): void {
    const fx = drunkEffects(session.promille);
    const filtered = filter.apply(drive, fx, gameTime);
    lastSteer = filtered.steer;
    car.step(filtered, dt, { steerFactor: session.steerFactor, steerResponse: fx.steerResponse });
    world.step(car.events);
    car.syncFromPhysics();
    traffic.update(dt, car.state);
    trafficView.sync(traffic.cars, graph);
    session.tick(dt, { speedKmh: car.speedKmh, ...graph.zoneAt(car.state.x, car.state.z), phoneUp: phone?.isUp() ?? false });
    gameTime += dt;
  }

  const projected = new THREE.Vector3();
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
        simulate(CONFIG.loop.fixedDt, drive);
        if (session.over) { finishRun(); break; }
      }
      blackoutEl.classList.toggle('on', blackout.update(frameDt, fx.blackoutPerSec, rng));
      phone?.applyEffects(fx);
      hud.update({ score: session.score, speedKmh: car.speedKmh, damage: session.damage, promille: session.promille, multiplier: session.multiplier, combo: session.comboAt(gameTime) });
    }

    // camera follows the car (driver sits on the left)
    const { x, z, heading } = car.state;
    const fx_ = Math.sin(heading), fz_ = Math.cos(heading);
    renderer.camera.position.set(x + fx_ * 0.2 + fz_ * 0.35, 1.2, z + fz_ * 0.2 - fx_ * 0.35);
    renderer.camera.rotation.set(0, heading + Math.PI, 0);
    cockpit.update(lastSteer, session.drinkProgress);
    post.apply(phase === 'playing' || phase === 'paused' ? fx : drunkEffects(0), gameTime);
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

    if (debug) {
      fpsAcc += frameDt; fpsFrames++;
      if (fpsAcc >= 0.5) { hud.showFps(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
    }
  }

  hud.reset();
  screens.showStart(newRun);
  requestAnimationFrame(frame);
  (window as unknown as { __nogEentjeDan?: unknown }).__nogEentjeDan = debug ? { get session() { return session; }, car, traffic: () => traffic } : undefined;
}

startGame().catch((err) => {
  console.error(err);
  const s = document.getElementById('screens');
  if (s) s.innerHTML = '<div class="screen"><div class="screen__box"><h2>Oeps</h2><p>Er ging iets mis bij het laden van de game.</p></div></div>';
});
