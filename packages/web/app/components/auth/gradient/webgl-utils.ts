type GL = WebGLRenderingContext;

export function compileShader(gl: GL, type: number, source: string): WebGLShader {
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

export function linkProgram(gl: GL, vSrc: string, fSrc: string): WebGLProgram {
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

export function uploadBuffer(gl: GL, data: Float32Array | Uint16Array, target: number): void {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('Failed to create buffer');
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, gl.STATIC_DRAW);
}

// Stripe density: xSeg = ceil(0.06 * width), ySeg = ceil(0.16 * height)
export function computeSegments(width: number, height: number): [number, number] {
  return [Math.ceil(0.06 * width), Math.ceil(0.16 * height)];
}

// Stripe PlaneGeometry.setTopology — UV layout:
//   uv.x = x/segX (0→1), uv.y = 1 - y/segY (1→0, top to bottom)
//   uvNorm.x = -1 + 2*x/segX, uvNorm.y = 1 - 2*y/segY
export function buildTopology(
  xSeg: number,
  ySeg: number
): {
  uvs: Float32Array;
  uvNorms: Float32Array;
  indices: Uint16Array;
} {
  const vertCount = (xSeg + 1) * (ySeg + 1);
  const uvs = new Float32Array(2 * vertCount);
  const uvNorms = new Float32Array(2 * vertCount);
  const indices = new Uint16Array(6 * xSeg * ySeg);

  for (let y = 0; y <= ySeg; y++) {
    for (let x = 0; x <= xSeg; x++) {
      const i = y * (xSeg + 1) + x;
      uvs[2 * i] = x / xSeg;
      uvs[2 * i + 1] = 1 - y / ySeg;
      uvNorms[2 * i] = -1 + (x / xSeg) * 2;
      uvNorms[2 * i + 1] = 1 - (y / ySeg) * 2;

      if (x < xSeg && y < ySeg) {
        const q = y * xSeg + x;
        indices[6 * q] = i;
        indices[6 * q + 1] = i + 1 + xSeg;
        indices[6 * q + 2] = i + 1;
        indices[6 * q + 3] = i + 1;
        indices[6 * q + 4] = i + 1 + xSeg;
        indices[6 * q + 5] = i + 2 + xSeg;
      }
    }
  }

  return { uvs, uvNorms, indices };
}

// Stripe PlaneGeometry.setSize with orientation "xz":
//   position.x = pixel X, position.y = 0, position.z = -pixel Y
export function buildPositions(xSeg: number, ySeg: number, w: number, h: number): Float32Array {
  const vertCount = (xSeg + 1) * (ySeg + 1);
  const positions = new Float32Array(3 * vertCount);
  const startX = -(w / 2);
  const startY = -(h / 2);
  const stepX = w / xSeg;
  const stepY = h / ySeg;

  for (let y = 0; y <= ySeg; y++) {
    const posY = startY + y * stepY;
    for (let x = 0; x <= xSeg; x++) {
      const posX = startX + x * stepX;
      const idx = y * (xSeg + 1) + x;
      positions[3 * idx] = posX;
      positions[3 * idx + 2] = -posY;
    }
  }

  return positions;
}
