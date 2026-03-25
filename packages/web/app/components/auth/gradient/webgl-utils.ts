export function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info ?? 'unknown'}`);
  }
  return shader;
}

export function linkProgram(gl: WebGLRenderingContext, vSrc: string, fSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fSrc);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info ?? 'unknown'}`);
  }
  return program;
}

export function uploadBuffer(
  gl: WebGLRenderingContext,
  data: Float32Array | Uint16Array,
  target: number
): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('Failed to create buffer');
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buffer;
}

interface PlaneGeometry {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

export function createPlane(segX: number, segY: number): PlaneGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cols = segX + 1;

  for (let y = 0; y <= segY; y++) {
    for (let x = 0; x <= segX; x++) {
      const u = x / segX;
      const v = y / segY;
      positions.push(u * 2 - 1, v * 2 - 1, 0);
      uvs.push(u, v);
    }
  }

  for (let y = 0; y < segY; y++) {
    for (let x = 0; x < segX; x++) {
      const i = y * cols + x;
      indices.push(i, i + 1, i + cols);
      indices.push(i + 1, i + cols + 1, i + cols);
    }
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  };
}
