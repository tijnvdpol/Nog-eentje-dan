import * as THREE from 'three';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import type { DrunkEffects } from '../drunk/effects';

const VignetteBlurShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, vignette: { value: 0 }, blur: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette; uniform float blur; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float d = length(c) * 1.414;
      float edge = smoothstep(0.25, 1.0, d);
      vec2 dir = normalize(c + 1e-5) * edge * blur * 0.03;
      vec4 col = vec4(0.0);
      for (int i = -4; i <= 4; i++) { col += texture2D(tDiffuse, vUv - dir * float(i) / 4.0); }
      col /= 9.0;
      float v = 1.0 - vignette * smoothstep(0.3, 1.1, d);
      gl_FragColor = vec4(col.rgb * v, col.a);
    }`,
};

export class PostFX {
  private composer: EffectComposer;
  private after: AfterimagePass;
  private rgb: ShaderPass;
  private vig: ShaderPass;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, private camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.after = new AfterimagePass(0);
    this.composer.addPass(this.after);
    this.rgb = new ShaderPass(RGBShiftShader);
    this.composer.addPass(this.rgb);
    this.vig = new ShaderPass(VignetteBlurShader);
    this.composer.addPass(this.vig);
    this.composer.addPass(new OutputPass());
    const size = renderer.getSize(new THREE.Vector2());
    this.resize(size.x, size.y);
  }

  /** Call after the camera pose was set for this frame: adds the drunk sway on top. */
  apply(fx: DrunkEffects, timeSec: number): void {
    this.after.damp = fx.afterimage * 0.88;
    this.rgb.uniforms['amount'].value = fx.rgbShift * 0.008;
    this.vig.uniforms['vignette'].value = fx.vignette;
    this.vig.uniforms['blur'].value = fx.edgeBlur;
    const sway = fx.sway * (0.05 * Math.sin(0.7 * timeSec) + 0.03 * Math.sin(1.3 * timeSec));
    this.camera.rotation.y += sway;
    this.camera.rotation.z += sway * 0.6;
  }

  render(): void { this.composer.render(); }

  resize(w: number, h: number): void {
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
  }
}
