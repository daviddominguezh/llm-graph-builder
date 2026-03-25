import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';
import type { GradientConfig, GradientHandle, WaveLayer } from './types';
import { createPlane, linkProgram, uploadBuffer } from './webgl-utils';

type GL = WebGLRenderingContext;

function uniform(gl: GL, program: WebGLProgram, name: string): WebGLUniformLocation | null {
  return gl.getUniformLocation(program, name);
}

function bindAttribute(gl: GL, program: WebGLProgram, name: string, data: Float32Array, size: number): void {
  uploadBuffer(gl, data, gl.ARRAY_BUFFER);
  const loc = gl.getAttribLocation(program, name);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
}

function setLayerUniforms(gl: GL, program: WebGLProgram, index: number, layer: WaveLayer): void {
  const i = index.toString();
  const [r, g, b] = layer.color;
  gl.uniform3f(uniform(gl, program, `u_waveColor${i}`), r, g, b);
  gl.uniform2f(uniform(gl, program, `u_waveNoiseFreq${i}`), layer.noiseFreq[0], layer.noiseFreq[1]);
  gl.uniform1f(uniform(gl, program, `u_waveNoiseSpeed${i}`), layer.noiseSpeed);
  gl.uniform1f(uniform(gl, program, `u_waveNoiseFlow${i}`), layer.noiseFlow);
  gl.uniform1f(uniform(gl, program, `u_waveNoiseSeed${i}`), layer.noiseSeed);
  gl.uniform1f(uniform(gl, program, `u_waveNoiseFloor${i}`), layer.noiseFloor);
  gl.uniform1f(uniform(gl, program, `u_waveNoiseCeil${i}`), layer.noiseCeil);
}

function setStaticUniforms(gl: GL, program: WebGLProgram, config: GradientConfig): void {
  const [br, bg, bb] = config.baseColor;
  gl.uniform3f(uniform(gl, program, 'u_baseColor'), br, bg, bb);
  gl.uniform1f(uniform(gl, program, 'u_noiseFreq'), config.noiseFreq);
  gl.uniform1f(uniform(gl, program, 'u_noiseSpeed'), config.noiseSpeed);
  gl.uniform1f(uniform(gl, program, 'u_darkenTop'), config.darkenTop ? 1 : 0);
  gl.uniform1f(uniform(gl, program, 'u_shadowPower'), 5);
  const [l0, l1, l2] = config.waveLayers;
  setLayerUniforms(gl, program, 0, l0);
  setLayerUniforms(gl, program, 1, l1);
  setLayerUniforms(gl, program, 2, l2);
}

function setupMesh(gl: GL, program: WebGLProgram): number {
  const mesh = createPlane(32, 32);
  bindAttribute(gl, program, 'a_position', mesh.positions, 3);
  bindAttribute(gl, program, 'a_uv', mesh.uvs, 2);
  uploadBuffer(gl, mesh.indices, gl.ELEMENT_ARRAY_BUFFER);
  return mesh.indices.length;
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
}

interface RenderState {
  gl: GL;
  canvas: HTMLCanvasElement;
  timeLoc: WebGLUniformLocation | null;
  resLoc: WebGLUniformLocation | null;
  indexCount: number;
  startTime: number;
  speed: number;
}

function renderFrame(state: RenderState): void {
  resizeCanvas(state.canvas);
  state.gl.viewport(0, 0, state.canvas.width, state.canvas.height);
  state.gl.uniform2f(state.resLoc, state.canvas.width, state.canvas.height);
  const elapsed = (performance.now() - state.startTime) / 1000;
  state.gl.uniform1f(state.timeLoc, elapsed * state.speed);
  state.gl.drawElements(state.gl.TRIANGLES, state.indexCount, state.gl.UNSIGNED_SHORT, 0);
}

export function createGradient(canvas: HTMLCanvasElement, config: GradientConfig): GradientHandle {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) throw new Error('WebGL not supported');

  const program = linkProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  gl.useProgram(program);

  const indexCount = setupMesh(gl, program);
  setStaticUniforms(gl, program, config);

  const state: RenderState = {
    gl,
    canvas,
    timeLoc: uniform(gl, program, 'u_time'),
    resLoc: uniform(gl, program, 'u_resolution'),
    indexCount,
    startTime: performance.now(),
    speed: config.speed,
  };
  let animId = 0;

  function loop(): void {
    renderFrame(state);
    animId = requestAnimationFrame(loop);
  }

  loop();

  return {
    destroy() {
      cancelAnimationFrame(animId);
    },
  };
}
