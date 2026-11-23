// The pixel pass (art-direction §3, AGENTS.md Rule 4): the scene renders into a small internal
// target (320×180 by default, 120..480 tall), which is upscaled by the largest whole factor that
// fits, nearest neighbour only. No anti-aliasing, no filtering, no mipmaps, no post-processing.
import * as THREE from 'three';
import type { RenderStats } from '../../../src/core/contract/api.js';
import { palette } from '../../../src/core/palette.js';
import { clampPixelHeight, frameWidth, PIXEL_HEIGHT, upscaleFactor } from '../model/pixels.js';
import { color } from './materials.js';
import { BLIT_FRAG, BLIT_VERT, OVERLAY_FRAG } from './shaders.js';

export class PixelPass {
  readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private readonly blitScene = new THREE.Scene();
  private readonly blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blit: THREE.ShaderMaterial;
  width: number = frameWidth(PIXEL_HEIGHT.default);
  height: number = PIXEL_HEIGHT.default;
  scale = 1;
  /** Compile or link failures since the last takeShaderErrors(). */
  private shaderErrors: string[] = [];
  /** #211: the constellation overlay, a nearest-sampled texture the size of the internal target, drawn over the scene into it. */
  private readonly overlayScene = new THREE.Scene();
  private readonly overlayMat: THREE.ShaderMaterial;
  private overlayTex: THREE.DataTexture | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'default' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // palette hexes go out untouched
    this.renderer.info.autoReset = false;
    // A program that fails to compile must never pass as a frame (AGENTS.md: render tests must fail
    // on a blank frame): record it, and View.load refuses the scene.
    this.renderer.debug.checkShaderErrors = true;
    this.renderer.debug.onShaderError = (gl, program, vs, fs) => {
      const log = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)].filter(Boolean).join(' ').trim();
      this.shaderErrors.push(log.slice(0, 300) || 'a shader program failed to link');
    };
    this.renderer.setClearColor(color(palette.world.space), 1);
    this.target = this.makeTarget(this.width, this.height);
    this.blit = new THREE.ShaderMaterial({
      vertexShader: BLIT_VERT, fragmentShader: BLIT_FRAG, depthTest: false, depthWrite: false,
      uniforms: { uSource: { value: this.target.texture }, uScale: { value: 1 } },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blit);
    quad.frustumCulled = false;
    this.blitScene.add(quad);
    this.overlayMat = new THREE.ShaderMaterial({
      vertexShader: BLIT_VERT, fragmentShader: OVERLAY_FRAG, depthTest: false, depthWrite: false,
      uniforms: { uOverlay: { value: null } },
    });
    const over = new THREE.Mesh(quad.geometry, this.overlayMat);
    over.frustumCulled = false;
    this.overlayScene.add(over);
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
      depthBuffer: true, stencilBuffer: false, samples: 0,
    });
  }

  /**
   * Sets the internal height and the whole upscale factor for the available device pixels. The
   * canvas is exactly the upscaled image; its CSS size is that divided by the device pixel ratio.
   */
  resize(pixelHeight: number, availDeviceW: number, availDeviceH: number, dpr: number): void {
    const h = clampPixelHeight(pixelHeight), w = frameWidth(h);
    if (w !== this.width || h !== this.height) {
      this.target.dispose();
      this.target = this.makeTarget(w, h);
      this.blit.uniforms['uSource']!.value = this.target.texture;
      this.width = w;
      this.height = h;
    }
    this.scale = upscaleFactor(w, h, availDeviceW, availDeviceH);
    this.blit.uniforms['uScale']!.value = this.scale;
    this.renderer.setSize(w * this.scale, h * this.scale, false);
    this.canvas.style.width = `${(w * this.scale) / dpr}px`;
    this.canvas.style.height = `${(h * this.scale) / dpr}px`;
  }

  /**
   * Renders the scene into the internal target, then upscales it to the canvas. Stats cover the whole frame: scene pass plus upscale.
   * `overlay` (#211) is given a reader of the rendered target and returns RGBA rows (top-down, the target's size, alpha 0 where
   * nothing is drawn) to draw over it before the upscale, or null for none: then the frame is exactly what it was without it.
   */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay?: (pixels: () => Uint8Array) => Uint8Array | null): RenderStats {
    camera.aspect = this.width / this.height;
    camera.updateProjectionMatrix();
    const r = this.renderer;
    r.info.reset();
    r.setRenderTarget(this.target);
    r.render(scene, camera); // autoClear: space colour, fresh depth
    const over = overlay?.(() => this.readTarget()) ?? null;
    if (over) this.drawOverlay(over);
    r.setRenderTarget(null);
    r.render(this.blitScene, this.blitCamera);
    // autoReset is off and info was reset at the frame's start, so these count both passes
    return { drawCalls: r.info.render.calls, triangles: r.info.render.triangles, width: this.width, height: this.height };
  }

  /** The shader failures since the last call, then clears them. */
  takeShaderErrors(): string[] {
    const out = this.shaderErrors;
    this.shaderErrors = [];
    return out;
  }

  /** The internal target's RGBA bytes, row 0 at the top. */
  private readTarget(): Uint8Array {
    const { width: w, height: h } = this;
    const buf = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, w, h, buf);
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) out.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // GL rows run bottom-up
    return out;
  }

  /** Draws RGBA rows (top-down) over the internal target, texel for pixel: one draw call, no blending. */
  private drawOverlay(rgba: Uint8Array): void {
    const { width: w, height: h } = this;
    if (!this.overlayTex || this.overlayTex.image.width !== w || this.overlayTex.image.height !== h) {
      this.overlayTex?.dispose();
      this.overlayTex = new THREE.DataTexture(new Uint8Array(w * h * 4), w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
      this.overlayTex.minFilter = THREE.NearestFilter;
      this.overlayTex.magFilter = THREE.NearestFilter;
      this.overlayTex.generateMipmaps = false;
      this.overlayMat.uniforms['uOverlay']!.value = this.overlayTex;
    }
    const data = this.overlayTex.image.data as Uint8Array;
    for (let y = 0; y < h; y++) data.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4); // texture rows run bottom-up
    this.overlayTex.needsUpdate = true;
    const r = this.renderer;
    r.autoClear = false;
    try {
      r.render(this.overlayScene, this.blitCamera);
    } finally {
      r.autoClear = true;
    }
  }

  /** Compiles the overlay's program, so View.load's shader check covers it before any frame needs it. */
  compileOverlay(): void { this.renderer.compile(this.overlayScene, this.blitCamera); }

  /** RGBA bytes of the internal target, row 0 at the top (contract: lowResPixels). */
  pixels(): { width: number; height: number; rgba: number[] } {
    return { width: this.width, height: this.height, rgba: Array.from(this.readTarget()) };
  }

  dispose(): void {
    this.target.dispose();
    this.blit.dispose();
    this.overlayMat.dispose();
    this.overlayTex?.dispose();
    this.renderer.dispose();
  }
}
