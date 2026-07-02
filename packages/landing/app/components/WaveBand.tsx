'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

// Particle wave ported from https://codepen.io/boytchev/full/OJYGqMP
// (see https://discourse.threejs.org/t/particle-wave-code/67327)

// Larger divisor = slower wave motion (pen used 2000).
const TIME_SCALE = 10000;

// Narrower FOV than the pen (30) zooms in so the same wave fills the wide
// band edge-to-edge. Same geometry, same number of waves — just tighter framing.
const CAMERA_FOV = 24;

type WaveScene = {
  start: () => void;
  renderStill: () => void;
  resize: () => void;
  dispose: () => void;
};

function displaceWave(pos: THREE.BufferAttribute, simplex: SimplexNoise, t: number) {
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, 0.5 * simplex.noise3d(x / 2, y / 2, t / TIME_SCALE));
  }
  pos.needsUpdate = true;
}

function createWaveScene(container: HTMLElement): WaveScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('dimgray');

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, container.clientWidth / container.clientHeight);
  camera.position.set(4, 2, 8);
  camera.lookAt(scene.position);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const geometry = new THREE.PlaneGeometry(6, 4, 150, 100);
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const material = new THREE.PointsMaterial({ size: 0.02 });
  const simplex = new SimplexNoise();

  const waves = new THREE.Points(geometry, material);
  waves.rotation.x = -Math.PI / 2;
  scene.add(waves);

  return {
    start: () =>
      renderer.setAnimationLoop((t) => {
        displaceWave(pos, simplex, t);
        renderer.render(scene, camera);
      }),
    renderStill: () => {
      displaceWave(pos, simplex, 0);
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
    <section aria-hidden="true" className="w-full overflow-hidden" style={{ backgroundColor: 'dimgray' }}>
      <div ref={containerRef} className="mx-auto h-[480px] w-[1000px]" />
    </section>
  );
}
