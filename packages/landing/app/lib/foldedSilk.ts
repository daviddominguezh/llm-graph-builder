import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import {
  FOLDED_SILK_FRAGMENT,
  FOLDED_SILK_LINES_FRAGMENT,
  FOLDED_SILK_VERTEX,
  GLOW_GRAIN_FRAGMENT,
  GLOW_GRAIN_VERTEX,
} from './foldedSilkShaders';

// Folded-silk sheet: one opaque plane folded over itself (baked geometry),
// animated by a vertex shader and painted by a fragment shader. Technique
// studied from Stripe's hero wave; the variant presets start from their
// tuned configs — 'solid' from the light hero, 'fibrous' from the dark
// line-based developers wave — and are ours to dial.

// Sheet in local units before the pixel-space transform.
const SHEET_SIZE = 400;
const SUBDIVISIONS_X = 128;
const SUBDIVISIONS_Y = 256;
// Half-width of the cylindrical crease zone of the fold.
const FOLD_HALF = 16;

const SPEED = 4e-5;
const GRAIN_AMOUNT = 1.1;

// Palette painted onto an offscreen canvas — the sheet samples it by UV.
// A coarse 2D color grid (sampled from the reference's palette) upscaled
// with bilinear smoothing into the final texture.
const PALETTE_GRID: readonly (readonly string[])[] = [
  ['#dfecff', '#d0e3f6', '#e4d4b4', '#f3c065', '#fab323', '#ffb10c', '#fd9660', '#f98bad', '#f982cf', '#fd93c0', '#f37a86', '#f8666c', '#f775a2', '#efa3d9', '#e9bdf2', '#e7edf8'],
  ['#d8e0fb', '#e2c9e8', '#f6bc5c', '#fcb328', '#fdab1a', '#fea524', '#fb8b73', '#f492af', '#f39bd4', '#f9a2d1', '#f392b6', '#fa7f79', '#fa9583', '#f8adb0', '#e550de', '#ecdaf0'],
  ['#f2b9ef', '#f8aac5', '#fcaa4c', '#fbb23b', '#ffb433', '#feaa67', '#ffa88c', '#f8b0c0', '#fab3dc', '#ffaede', '#feb0df', '#fa9bdd', '#fba29a', '#fc979d', '#fb98ae', '#f7bce1'],
  ['#ffb5ee', '#fd97cb', '#f77b9f', '#f89479', '#ffb56a', '#fdd09b', '#ffd8a1', '#fdd5ca', '#ffd1cf', '#f3a7c9', '#ea9bea', '#e3a1ef', '#f09fd8', '#ffb0b8', '#ffb6b4', '#fcb2c8'],
  ['#fb99dc', '#fa5fae', '#f466a5', '#f98990', '#fead78', '#fecaa3', '#fed6ab', '#fee4bf', '#fee4ac', '#ffd89f', '#fdd8a6', '#c3aae4', '#c7a4ec', '#fcafad', '#ffce8b', '#fcb7d4'],
  ['#f699dd', '#f46cb5', '#f88097', '#fcad67', '#febc83', '#ffcca9', '#ffe0c0', '#fee5c4', '#fee9bb', '#fed298', '#fcc599', '#feb5b1', '#fab4c1', '#fba5ba', '#f785b0', '#fbadda'],
  ['#da9edb', '#ec7db1', '#f58199', '#fba070', '#feb665', '#fec084', '#fddeb6', '#fee4ca', '#fdd8a5', '#ffa472', '#ff8652', '#ff7d59', '#fd9b70', '#f5849f', '#ee7eae', '#f1aadb'],
  ['#c195f0', '#c751d7', '#e14ec3', '#f87b95', '#fda46b', '#feb885', '#fedfc6', '#fce2d8', '#f8caa7', '#fdc8b1', '#fdb07e', '#fe9669', '#f87097', '#e246c8', '#c54bd6', '#e09fe5'],
];

export type FoldedSilkVariant = 'solid' | 'fibrous';

type VariantConfig = {
  // null = transparent canvas (page background shows through).
  background: string | null;
  fragmentShader: string;
  timeOffset: number;
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale: readonly [number, number, number];
  displaceFrequencyX: number;
  displaceFrequencyZ: number;
  displaceAmount: number;
  twistFrequencyX: number;
  twistFrequencyY: number;
  twistFrequencyZ: number;
  twistPowerX: number;
  twistPowerY: number;
  twistPowerZ: number;
  colorContrast: number;
  colorSaturation: number;
  colorHueShift: number;
  // Reference light material squares its output via custom blending.
  squareBlend: boolean;
  // Mode-specific uniforms; a factory so every instance gets fresh objects.
  extraUniforms: () => Record<string, THREE.IUniform>;
};

const VARIANTS: Record<FoldedSilkVariant, VariantConfig> = {
  // Solid opaque silk with noise fibers and fold glow, on white.
  solid: {
    background: null,
    fragmentShader: FOLDED_SILK_FRAGMENT,
    timeOffset: 17500,
    position: [640, -301.7, -11.1],
    rotation: [-0.4496, -0.1176, 1.8744],
    scale: [9, 8, 5],
    displaceFrequencyX: 0.005831,
    displaceFrequencyZ: 0.016001,
    displaceAmount: -7.821,
    twistFrequencyX: -0.65,
    twistFrequencyY: 0.41,
    twistFrequencyZ: -0.58,
    twistPowerX: 3.63,
    twistPowerY: 0.7,
    twistPowerZ: 3.95,
    colorContrast: 1,
    colorSaturation: 1.08,
    colorHueShift: 0,
    squareBlend: true,
    extraUniforms: () => ({
      u_glowAmount: { value: 1.98 },
      u_glowPower: { value: 0.806 },
      u_glowRamp: { value: 0.834 },
      u_fiberStrength: { value: 0.2 },
      u_fiberFrequency: { value: 600 },
      u_fiberColorAttenuation: { value: 0.9 },
      u_fiberParabolaPower: { value: 3 },
    }),
  },
  // Discrete flowing strands on dark navy — the line-based dark preset.
  fibrous: {
    background: '#070707',
    fragmentShader: FOLDED_SILK_LINES_FRAGMENT,
    timeOffset: 1150,
    position: [-24.3, -56.4, -11.1],
    rotation: [-0.1596, -0.2836, -2.8156],
    scale: [10, 10, 7],
    displaceFrequencyX: 0.003234,
    displaceFrequencyZ: 0.00799,
    displaceAmount: 6.051,
    twistFrequencyX: -0.055,
    twistFrequencyY: 0.077,
    twistFrequencyZ: -0.518,
    twistPowerX: 3.95,
    twistPowerY: 5.85,
    twistPowerZ: 6.33,
    colorContrast: 1,
    colorSaturation: 0.8,
    colorHueShift: -0.0316,
    squareBlend: false,
    extraUniforms: () => ({
      u_lineAmount: { value: 425 },
      u_lineThickness: { value: 1 },
      u_lineDerivativePower: { value: 0.95 },
      // Dim strands — the reference's dark band keeps them barely luminous.
      u_lineOpacity: { value: 0.3 },
      u_maxWidth: { value: 1232 },
      u_clearColor: { value: new THREE.Color('#070707') },
    }),
  },
};

export type FoldedSilk = {
  start: () => void;
  pause: () => void;
  renderStill: () => void;
  resize: () => void;
  dispose: () => void;
  // Live parameter setters for the tuning panel.
  setUniform: (name: string, value: number) => void;
  setMesh: (prop: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2, value: number) => void;
  setGrain: (value: number) => void;
  setZoom: (value: number) => void;
};

function parabola(x: number, k: number): number {
  return (4 * x * (1 - x)) ** k;
}

// Fold the plane over itself: left zone lifts, the middle strip wraps around
// a half-cylinder (the rounded crease), the right zone mirrors back over the
// left — a sheet lying folded like cloth. The fold radius breathes along the
// length via a sharp parabola envelope.
function createFoldedSheetGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(SHEET_SIZE, SHEET_SIZE, SUBDIVISIONS_X, SUBDIVISIONS_Y);
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = 4 - 2 * parabola(uv.getY(i), 9.5);
    if (v.x < -FOLD_HALF) {
      v.z += r;
    } else if (v.x < FOLD_HALF) {
      v.z = Math.cos(THREE.MathUtils.mapLinear(v.x, -FOLD_HALF, FOLD_HALF, 0, Math.PI)) * r;
      v.x = Math.cos(THREE.MathUtils.mapLinear(v.x, -FOLD_HALF, FOLD_HALF, -Math.PI / 2, Math.PI / 2)) * r - FOLD_HALF;
    } else {
      v.z -= r;
      v.x = -v.x;
    }
    v.x += SHEET_SIZE / 4;
    v.applyAxisAngle(xAxis, -Math.PI / 2);
    v.applyAxisAngle(yAxis, -Math.PI / 2);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createPaletteTexture(): THREE.CanvasTexture {
  const rows = PALETTE_GRID.length;
  const cols = PALETTE_GRID[0]?.length ?? 1;
  const seed = document.createElement('canvas');
  seed.width = cols;
  seed.height = rows;
  const seedCtx = seed.getContext('2d');
  if (!seedCtx) throw new Error('FoldedSilk: 2d canvas context unavailable');
  PALETTE_GRID.forEach((row, y) => {
    row.forEach((hex, x) => {
      seedCtx.fillStyle = hex;
      seedCtx.fillRect(x, y, 1, 1);
    });
  });
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('FoldedSilk: 2d canvas context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(seed, 0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createSheetMaterial(palette: THREE.Texture, config: VariantConfig): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FOLDED_SILK_VERTEX,
    fragmentShader: config.fragmentShader,
    side: THREE.DoubleSide,
    // Reference light-theme blend: out = src * src (SrcColor, Zero) — the
    // squaring is what turns the pastel palette into the deep saturated
    // silk. Decoded from their material constants (CustomBlending,
    // AddEquation, SrcColorFactor, ZeroFactor).
    ...(config.squareBlend
      ? {
          blending: THREE.CustomBlending,
          blendEquation: THREE.AddEquation,
          blendSrc: THREE.SrcColorFactor,
          blendDst: THREE.ZeroFactor,
        }
      : {}),
    uniforms: {
      u_time: { value: 0 },
      u_speed: { value: SPEED },
      u_resolution: { value: new THREE.Vector2(1, 1) },
      u_mousePosition: { value: new THREE.Vector2(0, 0) },
      u_paletteTexture: { value: palette },
      u_displaceFrequencyX: { value: config.displaceFrequencyX },
      u_displaceFrequencyZ: { value: config.displaceFrequencyZ },
      u_displaceAmount: { value: config.displaceAmount },
      u_twistFrequencyX: { value: config.twistFrequencyX },
      u_twistFrequencyY: { value: config.twistFrequencyY },
      u_twistFrequencyZ: { value: config.twistFrequencyZ },
      u_twistPowerX: { value: config.twistPowerX },
      u_twistPowerY: { value: config.twistPowerY },
      u_twistPowerZ: { value: config.twistPowerZ },
      u_colorContrast: { value: config.colorContrast },
      u_colorSaturation: { value: config.colorSaturation },
      u_colorHueShift: { value: config.colorHueShift },
      ...config.extraUniforms(),
    },
  });
}

export function createFoldedSilk(
  container: HTMLElement,
  timeOffset = 0,
  variant: FoldedSilkVariant = 'solid'
): FoldedSilk {
  const config = VARIANTS[variant];
  const scene = new THREE.Scene();
  scene.background = config.background === null ? null : new THREE.Color(config.background);

  // Orthographic, pixel-space frustum — the mesh transform is in pixels.
  const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 1, 10000);
  camera.position.set(100, 0, 5000);
  camera.lookAt(0, 0, 0);

  // Alpha canvas like the reference's hero: only the silk is painted, so
  // content stacked below the canvas (logo bar, guides) stays visible where
  // there is no wave.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // Raw sRGB pipeline like the reference (no color-space conversions):
  // palette texels pass through untransformed and shader constants operate
  // in the same space as theirs.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const palette = createPaletteTexture();
  palette.colorSpace = THREE.NoColorSpace;
  const material = createSheetMaterial(palette, config);
  // Upgrade to the full-detail palette asset once loaded (the coarse grid
  // renders instantly in the meantime).
  new THREE.TextureLoader().load('/reference/palette.png', (texture) => {
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    if (material.uniforms.u_paletteTexture) {
      material.uniforms.u_paletteTexture.value = texture;
    }
  });
  const geometry = createFoldedSheetGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...config.position);
  mesh.rotation.set(...config.rotation);
  mesh.scale.set(...config.scale);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // Two passes only, like the reference (scene target -> post to screen);
  // no output color-space conversion pass.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const grainPass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, u_grainAmount: { value: GRAIN_AMOUNT } },
    vertexShader: GLOW_GRAIN_VERTEX,
    fragmentShader: GLOW_GRAIN_FRAGMENT,
  });
  composer.addPass(grainPass);

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    material.uniforms.u_resolution?.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
  };
  resize();

  // Mouse tracking (normalized, y flipped) feeding the shader uniform.
  const onMouseMove = (event: MouseEvent) => {
    material.uniforms.u_mousePosition?.value.set(
      event.offsetX / container.clientWidth,
      1 - event.offsetY / container.clientHeight
    );
  };
  container.addEventListener('mousemove', onMouseMove);

  const renderFrame = (time: number) => {
    if (material.uniforms.u_time) {
      material.uniforms.u_time.value = time + config.timeOffset + timeOffset;
    }
    composer.render();
  };

  // Reference runtime: the animation clock eases in (ramp += 0.016 per
  // rendered frame, capped at 1), renders every 2nd RAF tick, and pauses
  // account for elapsed time so resuming never jumps the clock.
  let introTimeRamp = 0;
  let firstDrawTime: number | null = null;
  let pausedTime = 0;
  let pausedAt: number | null = null;
  let running = false;
  let frame = 0;

  const update = (t: number) => {
    frame += 1;
    if (frame % 2 !== 0) return;
    if (firstDrawTime === null) firstDrawTime = t;
    renderFrame((t - firstDrawTime - pausedTime) * introTimeRamp);
    introTimeRamp = Math.min(introTimeRamp + 0.016, 1);
  };

  return {
    start: () => {
      if (running) return;
      running = true;
      if (pausedAt !== null) {
        pausedTime += performance.now() - pausedAt;
        pausedAt = null;
      }
      renderer.setAnimationLoop(update);
    },
    pause: () => {
      if (!running) return;
      running = false;
      pausedAt = performance.now();
      renderer.setAnimationLoop(null);
    },
    renderStill: () => {
      introTimeRamp = 1;
      renderFrame(0);
    },
    setUniform: (name, value) => {
      const uniform = material.uniforms[name];
      if (uniform) uniform.value = value;
    },
    setMesh: (prop, axis, value) => {
      const target = prop === 'position' ? mesh.position : prop === 'scale' ? mesh.scale : mesh.rotation;
      if (axis === 0) target.x = value;
      else if (axis === 1) target.y = value;
      else target.z = value;
    },
    setGrain: (value) => {
      const uniform = grainPass.uniforms.u_grainAmount;
      if (uniform) uniform.value = value;
    },
    setZoom: (value) => {
      camera.zoom = value;
      camera.updateProjectionMatrix();
    },
    resize,
    dispose: () => {
      renderer.setAnimationLoop(null);
      container.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.remove();
      geometry.dispose();
      material.dispose();
      palette.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
