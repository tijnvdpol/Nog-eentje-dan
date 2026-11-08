import * as THREE from 'three';
import { CONFIG } from '../config';

const SKY = 0x2a2d4d;

export class Renderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly gl: THREE.WebGLRenderer;

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 20, CONFIG.world.fogFarM);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, CONFIG.world.fogFarM + 50);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.scene.add(new THREE.HemisphereLight(0x8d9bd6, 0x2c2a33, 1.4));
    const sun = new THREE.DirectionalLight(0xffc9a0, 0.9);
    sun.position.set(-200, 120, -150);
    this.scene.add(sun);
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void { this.gl.render(this.scene, this.camera); }
}
