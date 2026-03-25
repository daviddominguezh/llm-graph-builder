// 3D Simplex noise — ashima/webgl-noise (MIT License)
const SIMPLEX_NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

export const VERTEX_SHADER = /* glsl */ `
precision highp float;

${SIMPLEX_NOISE}

attribute vec3 a_position;
attribute vec2 a_uv;

uniform float u_time;
uniform float u_noiseFreq;
uniform float u_noiseSpeed;
uniform vec3 u_baseColor;
uniform vec3 u_waveColor0;
uniform vec3 u_waveColor1;
uniform vec3 u_waveColor2;
uniform vec2 u_waveNoiseFreq0;
uniform vec2 u_waveNoiseFreq1;
uniform vec2 u_waveNoiseFreq2;
uniform float u_waveNoiseSpeed0;
uniform float u_waveNoiseSpeed1;
uniform float u_waveNoiseSpeed2;
uniform float u_waveNoiseFlow0;
uniform float u_waveNoiseFlow1;
uniform float u_waveNoiseFlow2;
uniform float u_waveNoiseSeed0;
uniform float u_waveNoiseSeed1;
uniform float u_waveNoiseSeed2;
uniform float u_waveNoiseFloor0;
uniform float u_waveNoiseFloor1;
uniform float u_waveNoiseFloor2;
uniform float u_waveNoiseCeil0;
uniform float u_waveNoiseCeil1;
uniform float u_waveNoiseCeil2;

varying vec3 v_color;

float waveNoise(vec2 c, float t, vec2 f, float sp, float fl, float se, float lo, float hi) {
  return smoothstep(lo, hi, snoise(vec3(c.x * f.x + t * fl, c.y * f.y, t * sp + se)));
}

void main() {
  float time = u_time * u_noiseSpeed;
  vec2 nc = a_uv * u_noiseFreq;

  v_color = u_baseColor;

  float n0 = waveNoise(nc, time, u_waveNoiseFreq0, u_waveNoiseSpeed0, u_waveNoiseFlow0, u_waveNoiseSeed0, u_waveNoiseFloor0, u_waveNoiseCeil0);
  v_color = mix(v_color, u_waveColor0, n0);

  float n1 = waveNoise(nc, time, u_waveNoiseFreq1, u_waveNoiseSpeed1, u_waveNoiseFlow1, u_waveNoiseSeed1, u_waveNoiseFloor1, u_waveNoiseCeil1);
  v_color = mix(v_color, u_waveColor1, n1);

  float n2 = waveNoise(nc, time, u_waveNoiseFreq2, u_waveNoiseSpeed2, u_waveNoiseFlow2, u_waveNoiseSeed2, u_waveNoiseFloor2, u_waveNoiseCeil2);
  v_color = mix(v_color, u_waveColor2, n2);

  gl_Position = vec4(a_position.xy, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform vec2 u_resolution;
uniform float u_darkenTop;
uniform float u_shadowPower;

varying vec3 v_color;

void main() {
  vec3 color = v_color;
  if (u_darkenTop > 0.5) {
    vec2 st = gl_FragCoord.xy / u_resolution.xy;
    color.g -= pow(st.y + sin(-12.0) * st.x, u_shadowPower) * 0.4;
  }
  gl_FragColor = vec4(color, 1.0);
}
`;
