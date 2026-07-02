import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

// Silk-ribbon line field, evolved from the particle wave at
// https://codepen.io/boytchev/full/OJYGqMP.
//
// Layered sheets of dense semi-transparent strands laid along big animated
// spline sweeps. The silk look comes from three mechanics:
// - each sweep gives a deliberate S-curve down the frame (composition),
// - twist turns a ribbon edge-on in passing, packing strands into saturated
//   fold lines while flat stretches stay airy (shading via density),
// - per-strand ripple keeps the fibers from reading as perfectly parallel.

const TIME_SCALE = 30000;

// How far a sweep's control points wander — the big slow billow.
const DRIFT_AMPLITUDE = 0.9;
// Helix winding: how far (in half-turns) the roll's orientation rotates
// around the fall axis end to end, plus its animated wobble. This is what
// makes the curl trace a helicoid down the curtain.
const TWIST_TURNS = 1.5;
const TWIST_WOBBLE = 0.35;
// Folding: the cross-section is integrated as a walk across the width whose
// direction rotates with a helical curl (linear in the across position, so
// the sheet rolls onto itself like a scroll) plus a little noise for life.
const CURL_TOTAL = 3.8;
const FOLD_DEPTH = 0.45;
const FOLD_ACROSS = 1.8;
// Kept far below FOLD_ACROSS so crease lines run down the fall (with
// gravity) and pockets open sideways — never horizontal, anti-gravity folds.
const FOLD_ALONG = 0.25;
// Folds deepen down the fall, like a curtain gathering toward the hem.
const FOLD_GROWTH_MIN = 0.6;
// Width taper: the sheet fans out at the top and narrows to its configured
// width at the hem, like fabric gathered at the bottom. Quadratic falloff
// concentrates the fan in the visible upper frame (the path's ends are
// cropped off-screen, so a linear taper barely registers).
const TAPER_TOP = 2.6;
// Fold flanks shade darker the further they turn from the viewer.
const FOLD_SHADE_MIN = 0.72;
const FOLD_SHADE_SPAN = 0.28;

const SEGMENTS = 120;

// Rest pose of the sweep: dominantly vertical so it reads as a curtain
// falling — enters above the frame left-of-center, S-curves down through the
// middle, exits below right-of-center.
const PATH_TOP_Y = 5.5;
const PATH_BOTTOM_Y = -5.5;
const BASE_PATH = [
  new THREE.Vector3(-3.2, PATH_TOP_Y, -1),
  new THREE.Vector3(-1.6, 2, 0.8),
  new THREE.Vector3(0.6, -0.4, -0.8),
  new THREE.Vector3(1.8, -2.6, 0.6),
  new THREE.Vector3(3.2, PATH_BOTTOM_Y, -0.2),
];

// Multi-stop palette sampled diagonally: position along the sweep plus
// position across the width, so color flows in both directions.
const PALETTE = ['#9db2ff', '#7c4df0', '#ee3fa8', '#ff8f2e'];
const COLOR_ALONG = 0.7;
const COLOR_ACROSS = 0.4;

// Fake sheen: only ever deepens edge-on folds — flat stretches keep the full
// palette color, never a washed-out lighter version.
const BRIGHT_MIN = 0.75;
const BRIGHT_SPAN = 0.25;

const CAMERA_FOV = 30;

// Post-processing film grain strength.
const FILM_GRAIN = 0.18;

// Intrinsic world-space span of the ribbon cluster (all sheets + drift),
// used to fit it into the right half of the frame.
const CLUSTER_WIDTH = 6.6;
// Never shrink the cluster below this on narrow viewports.
const CLUSTER_MIN_SCALE = 0.75;

type RibbonConfig = {
  strands: number;
  width: number;
  xShift: number;
  zShift: number;
  // Offset on the noise clock so layers billow independently.
  timeOffset: number;
  // Shift into the palette so layers pick up different color bands.
  colorShift: number;
  opacity: number;
  // Depth-of-field: multi-tap blur radius. The focal plane sits on the
  // farthest sheet; the closer a sheet is to the viewer, the blurrier.
  blur: number;
};

// Diamond blur kernel: the whole intact sheet is drawn once per tap at a
// small uniform offset — a true convolution that softens edges while the
// interior stays coherent silk (per-strand scatter shreds it into fibers).
const BLUR_TAPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const BLUR_TAP_OPACITY = 0.35;

// Layered like the reference, packed close enough to overlap with no white
// gaps. Order matters — later entries draw on top.
const RIBBONS: RibbonConfig[] = [
  { strands: 300, width: 2.2, xShift: -1.3, zShift: -0.8, timeOffset: 29, colorShift: -0.15, opacity: 0.45, blur: 0.04 },
  { strands: 400, width: 3, xShift: 1.2, zShift: -1.4, timeOffset: 53, colorShift: 0.3, opacity: 0.55, blur: 0 },
  { strands: 650, width: 4.2, xShift: 0, zShift: 0, timeOffset: 0, colorShift: 0, opacity: 0.7, blur: 0.08 },
];

export type SilkRibbon = {
  start: () => void;
  renderStill: () => void;
  resize: () => void;
  dispose: () => void;
};

type Ribbon = {
  mesh: THREE.Group;
  update: (time: number) => void;
  dispose: () => void;
};

// Per-frame samples along a sweep, shared by every strand of its ribbon:
// center point, width direction (twisted), ripple direction (surface
// normal), brightness.
type FrameSamples = {
  pos: Float32Array;
  dir: Float32Array;
  rip: Float32Array;
  bright: Float32Array;
};

const paletteColors = PALETTE.map((hex) => new THREE.Color(hex));

function samplePalette(t: number, target: THREE.Color): THREE.Color {
  const scaled = THREE.MathUtils.clamp(t, 0, 1) * (paletteColors.length - 1);
  const i = Math.min(Math.floor(scaled), paletteColors.length - 2);
  const from = paletteColors[i];
  const to = paletteColors[i + 1];
  if (!from || !to) return target;
  return target.copy(from).lerp(to, scaled - i);
}

function buildBaseColors(config: RibbonConfig): Float32Array {
  const colors = new Float32Array(config.strands * (SEGMENTS + 1) * 3);
  const color = new THREE.Color();
  for (let s = 0; s < config.strands; s++) {
    const v = s / (config.strands - 1);
    for (let j = 0; j <= SEGMENTS; j++) {
      const u = j / SEGMENTS;
      samplePalette(u * COLOR_ALONG + v * COLOR_ACROSS + config.colorShift, color);
      color.toArray(colors, (s * (SEGMENTS + 1) + j) * 3);
    }
  }
  return colors;
}

// Line-segment index tracing each strand start-to-end along the sweep.
function buildStrandIndex(strands: number): number[] {
  const indices: number[] = [];
  for (let s = 0; s < strands; s++) {
    const base = s * (SEGMENTS + 1);
    for (let j = 0; j < SEGMENTS; j++) {
      indices.push(base + j, base + j + 1);
    }
  }
  return indices;
}

function createFrameSamples(): FrameSamples {
  const n = SEGMENTS + 1;
  return {
    pos: new Float32Array(n * 3),
    dir: new Float32Array(n * 3),
    rip: new Float32Array(n * 3),
    bright: new Float32Array(n),
  };
}

function driftControlPoints(
  points: THREE.Vector3[],
  simplex: SimplexNoise,
  time: number,
  config: RibbonConfig
) {
  BASE_PATH.forEach((base, i) => {
    const point = points[i];
    if (!point) return;
    // Horizontal sway only — fabric never billows upward against gravity.
    point.set(
      base.x + config.xShift + DRIFT_AMPLITUDE * simplex.noise3d(i * 11.3, 3, time),
      base.y,
      base.z + config.zShift + DRIFT_AMPLITUDE * simplex.noise3d(i * 11.3, 15, time)
    );
  });
}

// Module-scope temps so the per-frame loops allocate nothing.
const tmpPoint = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();

function updateFrameSamples(
  curve: THREE.CatmullRomCurve3,
  simplex: SimplexNoise,
  time: number,
  samples: FrameSamples
) {
  for (let j = 0; j <= SEGMENTS; j++) {
    const u = j / SEGMENTS;
    curve.getPoint(u, tmpPoint);
    // Cross-section confined to the horizontal plane: the twist rotates the
    // width/normal pair around the vertical axis only, so folds can open
    // sideways or toward the camera but never upward against gravity.
    const twist = TWIST_TURNS * Math.PI * u + TWIST_WOBBLE * simplex.noise3d(u * 1.5, 77, time);
    tmpDir.set(Math.cos(twist), 0, -Math.sin(twist));
    tmpNormal.set(Math.sin(twist), 0, Math.cos(twist));
    tmpPoint.toArray(samples.pos, j * 3);
    tmpDir.toArray(samples.dir, j * 3);
    tmpNormal.toArray(samples.rip, j * 3);
    samples.bright[j] = BRIGHT_MIN + BRIGHT_SPAN * Math.abs(tmpNormal.z);
  }
}

// Cross-section of the sheet at one point along the sweep: accumulated
// offsets in the width direction (d) and normal direction (r) per strand,
// plus how much the local surface faces the viewer (for shading).
type CrossSection = {
  d: Float32Array;
  r: Float32Array;
  facing: Float32Array;
  endD: number;
  endR: number;
};

function createCrossSection(strands: number): CrossSection {
  return {
    d: new Float32Array(strands),
    r: new Float32Array(strands),
    facing: new Float32Array(strands),
    endD: 0,
    endR: 0,
  };
}

// Walk across the width rotating by a noise-driven fold angle: past 90° the
// walk moves backward and the sheet folds over itself.
function integrateCrossSection(
  config: RibbonConfig,
  simplex: SimplexNoise,
  u: number,
  time: number,
  cross: CrossSection
) {
  const taper = 1 + (TAPER_TOP - 1) * (1 - u) * (1 - u);
  const dv = (config.width * taper) / (config.strands - 1);
  const depth = FOLD_GROWTH_MIN + (1 - FOLD_GROWTH_MIN) * u;
  let d = 0;
  let r = 0;
  for (let s = 0; s < config.strands; s++) {
    const v = s / (config.strands - 1);
    const wave = FOLD_DEPTH * simplex.noise3d(v * FOLD_ACROSS, u * FOLD_ALONG, time);
    const angle = depth * (CURL_TOTAL * (v - 0.5) + wave);
    cross.d[s] = d;
    cross.r[s] = r;
    const facing = Math.cos(angle);
    cross.facing[s] = facing;
    d += facing * dv;
    r += Math.sin(angle) * dv;
  }
  cross.endD = d;
  cross.endR = r;
}

function updateSheet(
  config: RibbonConfig,
  samples: FrameSamples,
  cross: CrossSection,
  simplex: SimplexNoise,
  time: number,
  positions: Float32Array,
  baseColors: Float32Array,
  colors: Float32Array
) {
  for (let j = 0; j <= SEGMENTS; j++) {
    const u = j / SEGMENTS;
    integrateCrossSection(config, simplex, u, time, cross);
    const k = j * 3;
    const px = samples.pos[k] ?? 0;
    const py = samples.pos[k + 1] ?? 0;
    const pz = samples.pos[k + 2] ?? 0;
    const dx = samples.dir[k] ?? 0;
    const dy = samples.dir[k + 1] ?? 0;
    const dz = samples.dir[k + 2] ?? 0;
    const rx = samples.rip[k] ?? 0;
    const ry = samples.rip[k + 1] ?? 0;
    const rz = samples.rip[k + 2] ?? 0;
    const bright = samples.bright[j] ?? 1;
    // Recenter so the pleated sheet stays hanging on the sweep line.
    const centerD = cross.endD / 2;
    const centerR = cross.endR / 2;
    // Screen-anchored width taper: scale the horizontal footprint around the
    // sweep line by height, AFTER folds and twist — so the twist phase can't
    // hide the widening in depth.
    const yNorm = THREE.MathUtils.clamp((py - PATH_BOTTOM_Y) / (PATH_TOP_Y - PATH_BOTTOM_Y), 0, 1);
    const screenTaper = 1 + (TAPER_TOP - 1) * yNorm * yNorm;
    for (let s = 0; s < config.strands; s++) {
      const offD = (cross.d[s] ?? 0) - centerD;
      const offR = (cross.r[s] ?? 0) - centerR;
      const idx = (s * (SEGMENTS + 1) + j) * 3;
      positions[idx] = px + (dx * offD + rx * offR) * screenTaper;
      positions[idx + 1] = py + dy * offD + ry * offR;
      positions[idx + 2] = pz + dz * offD + rz * offR;
      const shade = bright * (FOLD_SHADE_MIN + FOLD_SHADE_SPAN * Math.max(0, cross.facing[s] ?? 1));
      colors[idx] = (baseColors[idx] ?? 0) * shade;
      colors[idx + 1] = (baseColors[idx + 1] ?? 0) * shade;
      colors[idx + 2] = (baseColors[idx + 2] ?? 0) * shade;
    }
  }
}

function createRibbon(config: RibbonConfig, simplex: SimplexNoise): Ribbon {
  const controlPoints = BASE_PATH.map((point) => point.clone());
  const curve = new THREE.CatmullRomCurve3(controlPoints, false, 'centripetal');
  const samples = createFrameSamples();
  const cross = createCrossSection(config.strands);

  const baseColors = buildBaseColors(config);
  const positions = new Float32Array(baseColors.length);
  const colors = new Float32Array(baseColors.length);

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  const colorAttr = new THREE.BufferAttribute(colors, 3);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('color', colorAttr);
  geometry.setIndex(buildStrandIndex(config.strands));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: config.blur > 0 ? config.opacity * BLUR_TAP_OPACITY : config.opacity,
    depthWrite: false,
  });

  // One intact sheet per tap, all sharing the same streamed geometry: the
  // taps' small uniform offsets blend into a soft depth-of-field halo.
  const group = new THREE.Group();
  const taps = config.blur > 0 ? BLUR_TAPS : [[0, 0] as const];
  for (const [ox, oy] of taps) {
    const mesh = new THREE.LineSegments(geometry, material);
    mesh.position.set(ox * config.blur, oy * config.blur, 0);
    // Positions stream every frame; a stale bounding sphere must not cull us.
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  return {
    mesh: group,
    update: (time: number) => {
      const localTime = time + config.timeOffset;
      driftControlPoints(controlPoints, simplex, localTime, config);
      updateFrameSamples(curve, simplex, localTime, samples);
      updateSheet(config, samples, cross, simplex, localTime, positions, baseColors, colors);
      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

export function createSilkRibbon(container: HTMLElement): SilkRibbon {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('white');

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, container.clientWidth / container.clientHeight);
  camera.position.set(0, 0, 11);
  camera.lookAt(scene.position);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const simplex = new SimplexNoise();
  const ribbons = RIBBONS.map((config) => createRibbon(config, simplex));
  const stage = new THREE.Group();
  ribbons.forEach((ribbon, i) => {
    // Explicit paint order — transparent objects must layer as configured.
    ribbon.mesh.children.forEach((tap) => {
      tap.renderOrder = i;
    });
    stage.add(ribbon.mesh);
  });
  scene.add(stage);

  // Pin the cluster to the right half of the frame: left edge at the screen's
  // horizontal center, right edge at the screen's right edge.
  const layoutStage = () => {
    const aspect = container.clientWidth / container.clientHeight;
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * camera.position.z * aspect;
    const scale = Math.max(halfWidth / CLUSTER_WIDTH, CLUSTER_MIN_SCALE);
    stage.scale.setScalar(scale);
    stage.position.x = halfWidth / 2;
  };
  layoutStage();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new FilmPass(FILM_GRAIN));
  composer.addPass(new OutputPass());

  const update = (t: number) => {
    const time = t / TIME_SCALE;
    ribbons.forEach((ribbon) => ribbon.update(time));
    composer.render();
  };

  return {
    start: () => renderer.setAnimationLoop(update),
    renderStill: () => update(0),
    resize: () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      composer.setSize(container.clientWidth, container.clientHeight);
      layoutStage();
    },
    dispose: () => {
      renderer.setAnimationLoop(null);
      renderer.domElement.remove();
      ribbons.forEach((ribbon) => ribbon.dispose());
      composer.dispose();
      renderer.dispose();
    },
  };
}
