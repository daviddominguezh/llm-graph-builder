import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';
import type { GradientConfig, GradientHandle } from './types';
import { buildPositions, buildTopology, computeSegments, linkProgram, uploadBuffer } from './webgl-utils';

type GL = WebGLRenderingContext;

const SEED = 41;
const NUM_COLORS = 4;

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function buildOrthoMatrix(w: number, h: number): Float32Array {
  return new Float32Array([2 / w, 0, 0, 0, 0, 2 / h, 0, 0, 0, 0, 2 / (-2000 - 2000), 0, 0, 0, 0, 1]);
}

function loc(gl: GL, program: WebGLProgram, name: string): WebGLUniformLocation | null {
  return gl.getUniformLocation(program, name);
}

function bindAttr(gl: GL, program: WebGLProgram, name: string, data: Float32Array, size: number): void {
  uploadBuffer(gl, data, gl.ARRAY_BUFFER);
  const a = gl.getAttribLocation(program, name);
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0);
}

function setWaveLayer(gl: GL, program: WebGLProgram, idx: number, color: [number, number, number]): void {
  const i = idx + 1;
  const p = `u_waveLayers[${idx}]`;
  gl.uniform3f(loc(gl, program, `${p}.color`), color[0], color[1], color[2]);
  gl.uniform2f(loc(gl, program, `${p}.noiseFreq`), 2 + i / NUM_COLORS, 3 + i / NUM_COLORS);
  gl.uniform1f(loc(gl, program, `${p}.noiseSpeed`), 11 + 0.3 * i);
  gl.uniform1f(loc(gl, program, `${p}.noiseFlow`), 6.5 + 0.3 * i);
  gl.uniform1f(loc(gl, program, `${p}.noiseSeed`), SEED + 10 * i);
  gl.uniform1f(loc(gl, program, `${p}.noiseFloor`), 0.1);
  gl.uniform1f(loc(gl, program, `${p}.noiseCeil`), 0.63 + 0.07 * i);
}

function setStaticUniforms(gl: GL, program: WebGLProgram, config: GradientConfig): void {
  const colors = config.colors.map(hexToRgb);
  const u = (name: string) => loc(gl, program, name);
  gl.uniform1f(u('u_shadow_power'), 5);
  gl.uniform1f(u('u_darken_top'), config.darkenTop ? 1 : 0);
  gl.uniform4f(u('u_active_colors'), 1, 1, 1, 1);
  gl.uniform2f(u('u_global.noiseFreq'), 1e-4, 275e-6);
  gl.uniform1f(u('u_global.noiseSpeed'), 5e-6);
  gl.uniform1f(u('u_vertDeform.incline'), 0);
  gl.uniform1f(u('u_vertDeform.offsetTop'), -0.5);
  gl.uniform1f(u('u_vertDeform.offsetBottom'), -0.5);
  gl.uniform2f(u('u_vertDeform.noiseFreq'), 3, 4);
  gl.uniform1f(u('u_vertDeform.noiseAmp'), 320);
  gl.uniform1f(u('u_vertDeform.noiseSpeed'), 10);
  gl.uniform1f(u('u_vertDeform.noiseFlow'), 3);
  gl.uniform1f(u('u_vertDeform.noiseSeed'), SEED);
  const base = colors[0];
  if (base) gl.uniform3f(u('u_baseColor'), base[0], base[1], base[2]);
  for (let i = 1; i < colors.length; i++) {
    const color = colors[i];
    if (color) setWaveLayer(gl, program, i - 1, color);
  }
}

function setupCanvas(gl: GL, canvas: HTMLCanvasElement, program: WebGLProgram, w: number, h: number): void {
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniformMatrix4fv(loc(gl, program, 'projectionMatrix'), false, buildOrthoMatrix(w, h));
  gl.uniformMatrix4fv(loc(gl, program, 'modelViewMatrix'), false, IDENTITY);
  gl.uniform2f(loc(gl, program, 'resolution'), w, h);
  gl.uniform1f(loc(gl, program, 'aspectRatio'), w / h);
}

function setupMesh(gl: GL, program: WebGLProgram, w: number, h: number): number {
  const [segX, segY] = computeSegments(w, h);
  const topo = buildTopology(segX, segY);
  const positions = buildPositions(segX, segY, w, h);
  bindAttr(gl, program, 'position', positions, 3);
  bindAttr(gl, program, 'uv', topo.uvs, 2);
  bindAttr(gl, program, 'uvNorm', topo.uvNorms, 2);
  uploadBuffer(gl, topo.indices, gl.ELEMENT_ARRAY_BUFFER);
  return topo.indices.length;
}

interface AnimState {
  readonly gl: GL;
  readonly timeLoc: WebGLUniformLocation | null;
  readonly indexCount: number;
  accTime: number;
  lastFrame: number;
  animId: number;
}

function animate(state: AnimState): void {
  const now = performance.now();
  state.accTime += Math.min(now - state.lastFrame, 1000 / 15);
  state.lastFrame = now;
  state.gl.uniform1f(state.timeLoc, state.accTime);
  state.gl.clearColor(0, 0, 0, 0);
  state.gl.clearDepth(1);
  state.gl.drawElements(state.gl.TRIANGLES, state.indexCount, state.gl.UNSIGNED_SHORT, 0);
  state.animId = requestAnimationFrame(() => animate(state));
}

export function createGradient(canvas: HTMLCanvasElement, config: GradientConfig): GradientHandle {
  const gl = canvas.getContext('webgl', { antialias: true });
  if (!gl) throw new Error('WebGL not supported');

  const program = linkProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  gl.useProgram(program);

  // Stripe uses window.innerWidth × fixed 1100 for rendering dimensions.
  // CSS stretches the canvas to fill the 3000×2500 container.
  const w = window.innerWidth;
  const h = 1100;
  setupCanvas(gl, canvas, program, w, h);
  setStaticUniforms(gl, program, config);
  const indexCount = setupMesh(gl, program, w, h);

  const state: AnimState = {
    gl,
    timeLoc: loc(gl, program, 'u_time'),
    indexCount,
    accTime: 0,
    lastFrame: performance.now(),
    animId: 0,
  };

  animate(state);
  return { destroy: () => cancelAnimationFrame(state.animId) };
}
