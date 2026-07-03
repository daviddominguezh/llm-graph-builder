'use client';

import { useEffect, useRef } from 'react';

// Decorative particle backgrounds for bento cards, mirroring the reference's
// canvas graphics: 'scatter' = diagonal speckle bands, 'globe' = dotted
// hemisphere with orbit arcs.
type ParticleFieldMode = 'scatter' | 'globe';

type Particle = {
  x: number;
  y: number;
  // Drift direction (toward the field center, like the reference's
  // `dir = normalize(-pos)`), and a per-particle scatter weight.
  dirX: number;
  dirY: number;
  rand: number;
  r: number;
  color: string;
  alpha: number;
  phase: number;
};

const COLORS = ['#f06bb3', '#e14ec3', '#a05df0', '#f5b78a', '#8b7bf7'];

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;

const gauss = () => (Math.random() + Math.random() + Math.random()) / 3 - 0.5;

// Smooth 2D value noise — the JS stand-in for the reference's simplexNoise.
function hash2(ix: number, iy: number): number {
  const n = Math.sin(ix * 12.9898 + iy * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function noise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return (top + (bottom - top) * sy) * 2 - 1;
}

function withDrift(p: Omit<Particle, 'dirX' | 'dirY' | 'rand'>, cx: number, cy: number): Particle {
  const dx = cx - p.x;
  const dy = cy - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { ...p, dirX: dx / len, dirY: dy / len, rand: Math.random() };
}

function makeScatter(w: number, h: number): Particle[] {
  const particles: Particle[] = [];
  const bands: Array<[number, number, number, number, number, number]> = [
    // x0, y0, cx, cy, x1, y1 — quadratic bezier bands the speckle follows.
    [0.1 * w, 0.02 * h, 0.9 * w, 0.2 * h, 0.85 * w, 0.75 * h],
    [0.75 * w, 0.35 * h, 0.15 * w, 0.55 * h, 0.2 * w, 1.0 * h],
  ];
  bands.forEach(([x0, y0, cx, cy, x1, y1]) => {
    for (let i = 0; i < 900; i++) {
      const t = Math.random();
      const mt = 1 - t;
      const bx = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
      const by = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
      particles.push(
        withDrift(
          {
            x: bx + gauss() * 0.3 * w,
            y: by + gauss() * 0.22 * h,
            r: 0.6 + Math.random() * 1.6,
            color: pick(COLORS),
            alpha: 0.25 + Math.random() * 0.6,
            phase: Math.random() * Math.PI * 2,
          },
          0.5 * w,
          0.5 * h
        )
      );
    }
  });
  return particles;
}

function makeGlobe(w: number, h: number): Particle[] {
  const particles: Particle[] = [];
  const cx = 0.6 * w;
  const cy = 1.25 * h;
  const R = 1.05 * w;
  for (let i = 0; i < 2200; i++) {
    // Rim-weighted radius so the limb of the sphere reads densest.
    const rr = R * (0.55 + 0.45 * Math.random() ** 0.3);
    const angle = Math.PI + Math.random() * Math.PI;
    const x = cx + rr * Math.cos(angle);
    const y = cy + rr * Math.sin(angle) * 0.92;
    if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
    particles.push(
      withDrift(
        {
          x,
          y,
          r: 0.5 + Math.random() * 1.4,
          color: pick(COLORS),
          alpha: 0.2 + Math.random() * 0.6,
          phase: Math.random() * Math.PI * 2,
        },
        cx,
        cy
      )
    );
  }
  return particles;
}

function drawOrbits(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const arcs = [
    { color: 'rgba(106, 168, 247, 0.8)', ry: 0.34, tilt: -0.06 },
    { color: 'rgba(225, 78, 195, 0.8)', ry: 0.52, tilt: 0.04 },
  ];
  arcs.forEach((arc) => {
    ctx.save();
    ctx.translate(0.6 * w, 1.25 * h);
    ctx.rotate(arc.tilt);
    ctx.strokeStyle = arc.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.05 * w, 1.05 * w * arc.ry, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

export function ParticleFieldCanvas({ mode }: { mode: ParticleFieldMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: Particle[] = [];
    let raf = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = (t: number) => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      if (mode === 'globe') drawOrbits(ctx, width, height);
      // Reference motion model: each particle continuously displaces along
      // its radial direction by slow time-animated noise, weighted by a
      // per-particle random power (pos += dir * noise(pos*f + t*4e-5) * amp).
      const time = t * 0.00008;
      particles.forEach((p) => {
        const n = reduced ? 0 : noise2(p.x * 0.006 + time, p.y * 0.006 + time);
        const amp = 46 * p.rand * p.rand;
        const x = p.x + p.dirX * n * amp;
        const y = p.y + p.dirY * n * amp;
        const twinkle = reduced ? 1 : 0.7 + 0.3 * Math.sin(p.phase + t * 0.0012);
        ctx.globalAlpha = p.alpha * twinkle;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    const rebuild = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      particles = mode === 'scatter' ? makeScatter(canvas.width, canvas.height) : makeGlobe(canvas.width, canvas.height);
      cancelAnimationFrame(raf);
      draw(0);
    };

    const observer = new ResizeObserver(rebuild);
    observer.observe(canvas);
    rebuild();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [mode]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}
