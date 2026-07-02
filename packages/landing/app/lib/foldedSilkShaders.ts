// GLSL for the folded-silk sheet. Technique studied from Stripe's hero wave:
// a folded plane whose motion lives in the vertex shader (simplex displace +
// envelope-twisted rotations) and whose look lives in the fragment shader —
// either a solid surface (palette texture + noise fibers + screen-space-
// derivative fold glow) or discrete flowing lines on a dark ground. Shaders
// written from scratch on openly licensed building blocks: Gustavson/McEwan
// simplex noise (MIT), Inigo Quilez shaping functions (MIT), hue shift (CC0).

const SIMPLEX_2D = /* glsl */ `
vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

const COLOR_GRADE = /* glsl */ `
uniform float u_colorContrast;
uniform float u_colorSaturation;
uniform float u_colorHueShift;

vec3 hueShift(vec3 color, float shift) {
  vec3 axis = vec3(0.57735);
  vec3 projection = axis * dot(axis, color);
  vec3 U = color - projection;
  return U * cos(shift) + cross(axis, U) * sin(shift) + projection;
}

vec3 gradeColor(vec3 color) {
  color = (color - 0.5) * u_colorContrast + 0.5;
  vec3 gray = vec3(dot(vec3(0.299, 0.587, 0.114), color));
  color = mix(gray, color, u_colorSaturation);
  return hueShift(color, u_colorHueShift);
}
`;

export const FOLDED_SILK_VERTEX = /* glsl */ `
uniform float u_time;
uniform float u_speed;
uniform float u_displaceFrequencyX;
uniform float u_displaceFrequencyZ;
uniform float u_displaceAmount;
uniform float u_twistFrequencyX;
uniform float u_twistFrequencyY;
uniform float u_twistFrequencyZ;
uniform float u_twistPowerX;
uniform float u_twistPowerY;
uniform float u_twistPowerZ;

varying vec2 v_uv;
varying vec4 v_clipPosition;

${SIMPLEX_2D}

// IQ's exponential step: 1 at x=0, decaying with sharpness n.
float expStep(float x, float n) {
  return exp2(-exp2(n) * pow(x, n));
}

mat4 rotationMatrix(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;
  return mat4(
    oc * axis.x * axis.x + c, oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, 0.0,
    oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z - axis.x * s, 0.0,
    oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c, 0.0,
    0.0, 0.0, 0.0, 1.0
  );
}

void main() {
  v_uv = uv;

  float t = u_time * u_speed;
  vec3 p = position;
  // One gentle noise displacement out of the sheet plane.
  p.y += u_displaceAmount * snoise(vec2(p.x * u_displaceFrequencyX + t, p.z * u_displaceFrequencyZ + t));

  // Three twists around diagonal axes, each concentrated at one end of the
  // sheet by an expStep envelope — this is what rolls the folds gracefully.
  mat4 rotA = rotationMatrix(vec3(0.5, 0.0, 0.5), u_twistFrequencyY * expStep(v_uv.x, u_twistPowerY));
  mat4 rotB = rotationMatrix(vec3(0.0, 0.5, 0.5), u_twistFrequencyX * expStep(v_uv.y, u_twistPowerX));
  mat4 rotC = rotationMatrix(vec3(0.5, 0.0, 0.5), u_twistFrequencyZ * expStep(v_uv.y, u_twistPowerZ));

  vec4 q = vec4(p, 1.0) * rotA;
  q = q * rotB;
  q = q * rotC;

  v_clipPosition = projectionMatrix * modelViewMatrix * vec4(q.xyz, 1.0);
  gl_Position = v_clipPosition;
}
`;

export const FOLDED_SILK_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D u_paletteTexture;
uniform vec2 u_resolution;
uniform float u_fiberStrength;
uniform float u_fiberFrequency;
uniform float u_fiberColorAttenuation;
uniform float u_fiberParabolaPower;
uniform float u_glowAmount;
uniform float u_glowPower;
uniform float u_glowRamp;

varying vec2 v_uv;

${SIMPLEX_2D}

${COLOR_GRADE}

float parabola(float x, float k) {
  return pow(4.0 * x * (1.0 - x), k);
}

float mapLinear(float value, float min1, float max1, float min2, float max2) {
  return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

void main() {
  // Screen-space UV compression: where the folded sheet turns edge-on, the
  // UV gradient per pixel collapses — that drives fold glow and fiber gain.
  float pdy = dFdy(v_uv).y * u_resolution.y * u_glowAmount;
  pdy = clamp(mapLinear(pdy, -1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  pdy = pow(pdy, u_glowPower);
  pdy = smoothstep(0.0, u_glowRamp, pdy);
  pdy = clamp(pdy, 0.0, 1.0);

  vec3 color = texture2D(u_paletteTexture, v_uv).rgb;

  // Brushed-fiber texture: high-frequency noise stripes along the sheet,
  // wandering with a low-frequency drift field.
  float envelope = 1.0 - parabola(v_uv.x, u_fiberParabolaPower);
  float drift = snoise(vec2(v_uv.x * 0.1, v_uv.y * 0.5));
  float fiber = snoise(vec2(v_uv.x * (u_fiberFrequency + u_fiberFrequency * 0.5 * drift), v_uv.y * 4.0 * drift));
  fiber = fiber * 0.5 + 0.5;
  color += fiber * u_fiberStrength * (1.0 - color.b * u_fiberColorAttenuation) * pdy * envelope;

  color = gradeColor(color);

  // Luminous rims where the sheet folds away.
  color += (1.0 - pdy) * 0.25;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const FOLDED_SILK_LINES_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D u_paletteTexture;
uniform vec3 u_clearColor;
uniform float u_lineAmount;
uniform float u_lineThickness;
uniform float u_lineDerivativePower;
uniform float u_maxWidth;

varying vec2 v_uv;
varying vec4 v_clipPosition;

${COLOR_GRADE}

void main() {
  vec3 color = gradeColor(texture2D(u_paletteTexture, v_uv).rgb);

  // Discrete strands: anti-aliased zero crossings of a sine across the
  // sheet. Thickness follows the screen-space UV derivative so lines hold
  // a near-constant pixel width however the sheet folds.
  float lineThickness = u_lineThickness * pow(abs(dFdy(v_uv).x * u_maxWidth), u_lineDerivativePower);
  float line = abs(sin(v_uv.x * u_lineAmount));
  line = smoothstep(lineThickness, 0.0, line);

  // Non-line pixels mix to the ground color instead of using transparency —
  // opaque output, no blend-sorting artifacts. Receding folds fade out.
  float depthFade = clamp(v_clipPosition.z * 6.0, 0.0, 1.0);
  color = mix(u_clearColor, color, line * (1.0 - depthFade));

  gl_FragColor = vec4(color, 1.0);
}
`;
