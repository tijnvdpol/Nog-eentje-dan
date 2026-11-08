import * as THREE from 'three';

export class Cockpit {
  private wheel: THREE.Group;
  private can: THREE.Mesh;
  private canRest = new THREE.Vector3(0.45, -0.36, -0.7);
  private canMouth = new THREE.Vector3(0.12, -0.12, -0.3);

  constructor(camera: THREE.PerspectiveCamera) {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x2b2d36, roughness: 0.7 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x66e0ff });

    const dash = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.7), dark);
    dash.position.set(0.3, -0.62, -0.85);
    g.add(dash);
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3), trim);
    cowl.position.set(0, -0.36, -0.9);
    g.add(cowl);
    const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.12), glow);
    gauge.position.set(0, -0.26, -0.88);
    gauge.rotation.x = -0.5;
    g.add(gauge);

    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), dark);
      pillar.position.set(s * 0.95, 0.15, -0.75);
      pillar.rotation.z = -s * 0.35;
      pillar.rotation.x = 0.1;
      g.add(pillar);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.2), dark);
    roof.position.set(0, 0.72, -0.4);
    g.add(roof);

    this.wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 10, 28), trim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), dark);
    hub.rotation.x = Math.PI / 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.02), trim);
    this.wheel.add(rim, hub, spoke);
    this.wheel.position.set(0, -0.3, -0.6);
    this.wheel.rotation.x = -0.9;
    g.add(this.wheel);

    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.05, 14), trim);
    holder.position.set(0.45, -0.4, -0.7);
    g.add(holder);
    this.can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.033, 0.033, 0.12, 14),
      new THREE.MeshStandardMaterial({ color: 0xf2b705, metalness: 0.6, roughness: 0.35 }),
    );
    this.can.position.copy(this.canRest);
    g.add(this.can);
    camera.add(g);
  }

  /** World position of the can, for placing the DOM hotspot. */
  canWorldPosition(target: THREE.Vector3): THREE.Vector3 { return this.can.getWorldPosition(target); }

  update(steer: number, drinkProgress: number | null): void {
    this.wheel.rotation.z = -steer * 1.1;
    if (drinkProgress === null) {
      this.can.position.copy(this.canRest);
      this.can.rotation.set(0, 0, 0);
      return;
    }
    const k = Math.sin(Math.PI * Math.min(1, Math.max(0, drinkProgress)));
    this.can.position.lerpVectors(this.canRest, this.canMouth, k);
    this.can.rotation.set(0.9 * k, 0, 0.3 * k);
  }
}
