import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FOLDED_SILK_FRAGMENT, FOLDED_SILK_VERTEX } from './foldedSilkShaders';

// Folded-silk sheet: one opaque plane folded over itself (baked geometry),
// animated by a vertex shader and painted by a fragment shader. Technique
// studied from Stripe's hero wave; parameters below start from their tuned
// light-theme values and are ours to dial.

// Sheet in local units before the pixel-space transform.
const SHEET_SIZE = 400;
const SUBDIVISIONS_X = 128;
const SUBDIVISIONS_Y = 256;
// Half-width of the cylindrical crease zone of the fold.
const FOLD_HALF = 16;

// Pixel-space placement of the sheet in the orthographic frame.
const MESH_POSITION = new THREE.Vector3(380, -301.7, -11.1);
const MESH_ROTATION = new THREE.Euler(-0.4496, -0.1176, 1.8744);
const MESH_SCALE = new THREE.Vector3(9, 8, 5);

const MATERIAL_UNIFORM_VALUES = {
  speed: 4e-5,
  timeOffset: 17500,
  displaceFrequencyX: 0.005831,
  displaceFrequencyZ: 0.016001,
  displaceAmount: -7.821,
  twistFrequencyX: -0.65,
  twistFrequencyY: 0.41,
  twistFrequencyZ: -0.58,
  twistPowerX: 3.63,
  twistPowerY: 0.7,
  twistPowerZ: 3.95,
  glowAmount: 1.98,
  glowPower: 0.806,
  glowRamp: 0.834,
  fiberStrength: 0.2,
  fiberFrequency: 600,
  fiberColorAttenuation: 0.9,
  fiberParabolaPower: 3,
  colorContrast: 1,
  colorSaturation: 1,
  colorHueShift: 0,
};

// Palette painted onto an offscreen canvas — the sheet samples it by UV.
const PALETTE_STOPS = ['#9db2ff', '#7c4df0', '#ee3fa8', '#ff8f2e', '#ffd82e'];

const FILM_GRAIN = 0.14;

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

function createSheetMaterial(palette: THREE.Texture): THREE.ShaderMaterial {
  const c = MATERIAL_UNIFORM_VALUES;
  return new THREE.ShaderMaterial({
    vertexShader: FOLDED_SILK_VERTEX,
    fragmentShader: FOLDED_SILK_FRAGMENT,
    side: THREE.DoubleSide,
    uniforms: {
      u_time: { value: 0 },
      u_speed: { value: c.speed },
      u_resolution: { value: new THREE.Vector2(1, 1) },
      u_paletteTexture: { value: palette },
      u_displaceFrequencyX: { value: c.displaceFrequencyX },
      u_displaceFrequencyZ: { value: c.displaceFrequencyZ },
      u_displaceAmount: { value: c.displaceAmount },
      u_twistFrequencyX: { value: c.twistFrequencyX },
      u_twistFrequencyY: { value: c.twistFrequencyY },
      u_twistFrequencyZ: { value: c.twistFrequencyZ },
      u_twistPowerX: { value: c.twistPowerX },
      u_twistPowerY: { value: c.twistPowerY },
      u_twistPowerZ: { value: c.twistPowerZ },
      u_glowAmount: { value: c.glowAmount },
      u_glowPower: { value: c.glowPower },
      u_glowRamp: { value: c.glowRamp },
      u_fiberStrength: { value: c.fiberStrength },
      u_fiberFrequency: { value: c.fiberFrequency },
      u_fiberColorAttenuation: { value: c.fiberColorAttenuation },
      u_fiberParabolaPower: { value: c.fiberParabolaPower },
      u_colorContrast: { value: c.colorContrast },
      u_colorSaturation: { value: c.colorSaturation },
      u_colorHueShift: { value: c.colorHueShift },
    },
  });
}

export function createFoldedSilk(container: HTMLElement): FoldedSilk {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('white');

  // Orthographic, pixel-space frustum — the mesh transform is in pixels.
  const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 1, 10000);
  camera.position.set(100, 0, 5000);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const palette = createPaletteTexture();
  const material = createSheetMaterial(palette);
  const geometry = createFoldedSheetGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(MESH_POSITION);
  mesh.rotation.copy(MESH_ROTATION);
  mesh.scale.copy(MESH_SCALE);
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
      material.uniforms.u_time.value = t + MATERIAL_UNIFORM_VALUES.timeOffset;
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
