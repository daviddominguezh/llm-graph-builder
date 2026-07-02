import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FOLDED_SILK_FRAGMENT, FOLDED_SILK_LINES_FRAGMENT, FOLDED_SILK_VERTEX } from './foldedSilkShaders';

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
const FILM_GRAIN = 0.14;

// Palette painted onto an offscreen canvas — the sheet samples it by UV.
const PALETTE_STOPS = ['#9db2ff', '#7c4df0', '#ee3fa8', '#ff8f2e', '#ffd82e'];

export type FoldedSilkVariant = 'solid' | 'fibrous';

type VariantConfig = {
  background: string;
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
  // Mode-specific uniforms; a factory so every instance gets fresh objects.
  extraUniforms: () => Record<string, THREE.IUniform>;
};

const VARIANTS: Record<FoldedSilkVariant, VariantConfig> = {
  // Solid opaque silk with noise fibers and fold glow, on white.
  solid: {
    background: '#ffffff',
    fragmentShader: FOLDED_SILK_FRAGMENT,
    timeOffset: 17500,
    position: [380, -301.7, -11.1],
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
    colorSaturation: 1,
    colorHueShift: 0,
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
    background: '#0a2540',
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
    colorSaturation: 1.15,
    colorHueShift: -0.0316,
    extraUniforms: () => ({
      u_lineAmount: { value: 425 },
      u_lineThickness: { value: 1 },
      u_lineDerivativePower: { value: 0.95 },
      u_maxWidth: { value: 1232 },
      u_clearColor: { value: new THREE.Color('#0a2540') },
    }),
  },
};

export type FoldedSilk = {
  start: () => void;
  renderStill: () => void;
  resize: () => void;
  dispose: () => void;
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
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('FoldedSilk: 2d canvas context unavailable');
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  PALETTE_STOPS.forEach((stop, i) => {
    gradient.addColorStop(i / (PALETTE_STOPS.length - 1), stop);
  });
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Vertical sheen so color varies across both UV axes.
  const sheen = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
  sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(1, 'rgba(40, 20, 80, 0.25)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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
    uniforms: {
      u_time: { value: 0 },
      u_speed: { value: SPEED },
      u_resolution: { value: new THREE.Vector2(1, 1) },
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
  scene.background = new THREE.Color(config.background);

  // Orthographic, pixel-space frustum — the mesh transform is in pixels.
  const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 1, 10000);
  camera.position.set(100, 0, 5000);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const palette = createPaletteTexture();
  const material = createSheetMaterial(palette, config);
  const geometry = createFoldedSheetGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...config.position);
  mesh.rotation.set(...config.rotation);
  mesh.scale.set(...config.scale);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new FilmPass(FILM_GRAIN));
  composer.addPass(new OutputPass());

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

  const update = (t: number) => {
    if (material.uniforms.u_time) {
      material.uniforms.u_time.value = t + config.timeOffset + timeOffset;
    }
    composer.render();
  };

  return {
    start: () => renderer.setAnimationLoop(update),
    renderStill: () => update(0),
    resize,
    dispose: () => {
      renderer.setAnimationLoop(null);
      renderer.domElement.remove();
      geometry.dispose();
      material.dispose();
      palette.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
