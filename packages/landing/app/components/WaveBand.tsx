'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

// Particle wave ported from https://codepen.io/boytchev/full/OJYGqMP
// (see https://discourse.threejs.org/t/particle-wave-code/67327)

// Larger divisor = slower wave motion (pen used 2000).
const TIME_SCALE = 10000;

// Fabric feel: broad soft folds (bigger amplitude, lower frequency than the
// pen's terrain), lateral sway so lines bend like threads instead of a
// heightfield, folds drifting sideways like wind, and a flutter envelope so
// the far edge hangs calm while the near hem moves freely.
const FOLD_AMPLITUDE = 0.8;
const FOLD_SCALE = 3;
const WIND_DRIFT = 1.2;
const SWAY_AMPLITUDE = 0.35;
const SWAY_SCALE = 1.5;
const FLUTTER_MIN = 0.35;

// With the rolled camera the ribbon's long axis runs vertically, so the
// vertical FOV must cover what the horizontal FOV covered in the landscape
// framing (24° at a ~2:1 aspect ≈ 48° across).
const CAMERA_FOV = 24;

// Each row-line gets one flat color, stepping across this gradient from the
// first line (start) to the last line (end).
const GRADIENT_START = '#fa709a';
const GRADIENT_END = '#fee140';

type WaveScene = {
  start: () => void;
  renderStill: () => void;
  resize: () => void;
  dispose: () => void;
};

function displaceWave(pos: THREE.BufferAttribute, base: Float32Array, simplex: SimplexNoise, t: number) {
  const time = t / TIME_SCALE;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3] ?? 0;
    const y = base[i * 3 + 1] ?? 0;
    // 0 at the pinned edge, 1 at the free hem — plane Y spans -2..2. With the
    // rolled camera the pinned edge sits at the top of the frame.
    const flutter = FLUTTER_MIN + (1 - FLUTTER_MIN) * ((2 - y) / 4);
    const fold = simplex.noise3d((x + time * WIND_DRIFT) / FOLD_SCALE, y / FOLD_SCALE, time);
    const sway = simplex.noise3d(x / SWAY_SCALE, y / SWAY_SCALE, time + 37);
    pos.setXYZ(i, x + SWAY_AMPLITUDE * flutter * sway, y, FOLD_AMPLITUDE * flutter * fold);
  }
  pos.needsUpdate = true;
}

// Index connecting each row of plane vertices left-to-right along X, so the
// plane renders as horizontal traced lines (one per row) instead of dots.
function buildRowLineIndex(widthSegments: number, heightSegments: number): number[] {
  const cols = widthSegments + 1;
  const indices: number[] = [];
  for (let row = 0; row <= heightSegments; row++) {
    const base = row * cols;
    for (let col = 0; col < widthSegments; col++) {
      indices.push(base + col, base + col + 1);
    }
  }
  return indices;
}

// One flat color per row, interpolated across the gradient by row index, so
// each traced line has a single unique color that differs from its neighbors.
function buildRowColors(widthSegments: number, heightSegments: number): Float32Array {
  const cols = widthSegments + 1;
  const rows = heightSegments + 1;
  const start = new THREE.Color(GRADIENT_START);
  const end = new THREE.Color(GRADIENT_END);
  const rowColor = new THREE.Color();
  const colors = new Float32Array(cols * rows * 3);
  for (let row = 0; row < rows; row++) {
    rowColor.copy(start).lerp(end, row / heightSegments);
    for (let col = 0; col < cols; col++) {
      rowColor.toArray(colors, (row * cols + col) * 3);
    }
  }
  return colors;
}

function createWaveScene(container: HTMLElement): WaveScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('white');

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, container.clientWidth / container.clientHeight);
  camera.position.set(4, 2, 8);
  // Roll the view 90°: the silk ribbon keeps its grazing angle (which is what
  // makes the folds silhouette) but runs top-to-bottom in the frame instead
  // of left-to-right — a falling curtain, taller than wide.
  camera.up.set(1, 0, 0);
  camera.lookAt(scene.position);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const geometry = new THREE.PlaneGeometry(6, 4, 150, 400);
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  geometry.setIndex(buildRowLineIndex(geometry.parameters.widthSegments, geometry.parameters.heightSegments));
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(buildRowColors(geometry.parameters.widthSegments, geometry.parameters.heightSegments), 3)
  );
  const material = new THREE.LineBasicMaterial({ vertexColors: true });
  const simplex = new SimplexNoise();
  // Undeformed positions — lateral sway must displace from the rest pose,
  // not from the previous frame, or the drift compounds.
  const basePos = new Float32Array(pos.array);

  const waves = new THREE.LineSegments(geometry, material);
  waves.rotation.x = -Math.PI / 2;
  scene.add(waves);

  return {
    start: () =>
      renderer.setAnimationLoop((t) => {
        displaceWave(pos, basePos, simplex, t);
        renderer.render(scene, camera);
      }),
    renderStill: () => {
      displaceWave(pos, basePos, simplex, 0);
      renderer.render(scene, camera);
    },
    resize: () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    },
    dispose: () => {
      renderer.setAnimationLoop(null);
      renderer.domElement.remove();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function WaveBand() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wave = createWaveScene(container);
    const reduced = prefersReducedMotion();

    if (reduced) {
      wave.renderStill();
    } else {
      wave.start();
    }

    const observer = new ResizeObserver(() => {
      wave.resize();
      if (reduced) wave.renderStill();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      wave.dispose();
    };
  }, []);

  return (
    <section aria-hidden="true" className="w-full overflow-hidden bg-white">
      <div ref={containerRef} className="mx-auto h-[720px] w-[480px]" />
    </section>
  );
}
