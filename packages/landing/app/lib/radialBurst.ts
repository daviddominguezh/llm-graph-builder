// Interactive radial line-burst: hundreds of thin lines fanning out from a
// bottom-centre origin across the upper semicircle, each capped with a dot and
// tinted blue→purple along its length. The mouse repels nearby line tips, which
// ease back to rest when it leaves. Additive ('lighter') compositing makes the
// dense core glow. Rendered on a plain 2D canvas.

export type RadialBurst = {
  resize: () => void;
  start: () => void;
  stop: () => void;
  renderStill: () => void;
  setMouse: (x: number, y: number) => void;
  clearMouse: () => void;
  dispose: () => void;
};

type Line = {
  dx: number; // unit direction on the sphere (x)
  dy: number; // unit direction on the sphere (y)
  dz: number; // unit direction on the sphere (z, toward viewer)
  lenFrac: number;
  width: number;
  alpha: number;
  tipLight: number;
  dot: number;
  phase: number;
  cx: number;
  cy: number;
};

type Dim = { w: number; h: number; ox: number; oy: number; maxR: number };
type Mouse = { x: number; y: number; active: boolean };

const LINE_COUNT = 210;
const INFLUENCE = 150; // px radius of the mouse repulsion
const PUSH = 62; // max px a tip is pushed
const EASE = 0.12; // tip return/approach easing
const TILT = 0.42; // fixed camera tilt (radians) — view the sphere at an angle
const CAM = 5; // perspective camera distance (larger = flatter)
const ROT_SPEED = 0.0001; // radians per ms — a slow spin that reads as 3D depth

// Even directions on a unit sphere (Fibonacci lattice) so the rotating burst
// looks like a full 3D dandelion rather than a flat fan.
function buildLines(): Line[] {
  const lines: Line[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < LINE_COUNT; i++) {
    const dy = 1 - (i / (LINE_COUNT - 1)) * 2; // 1 → -1
    const r = Math.sqrt(Math.max(0, 1 - dy * dy));
    const theta = golden * i;
    const lenFrac = 0.3 + Math.pow(Math.random(), 0.6) * 0.68;
    lines.push({
      dx: Math.cos(theta) * r,
      dy,
      dz: Math.sin(theta) * r,
      lenFrac,
      width: 0.6 + Math.random() * 0.7,
      alpha: 0.36 + (1 - lenFrac / 1.12) * 0.4,
      tipLight: 70 + Math.random() * 12,
      dot: 1 + Math.random() * 1.7,
      phase: Math.random() * Math.PI * 2,
      cx: 0,
      cy: 0,
    });
  }
  return lines;
}

// Spin the direction slowly around Y and tilt it a fixed amount around X, then
// return the rotated vector plus a perspective factor — the depth cues that
// turn the flat fan into a rotating 3D burst.
function project(ln: Line, rot: number): { fx: number; fy: number; fz: number; persp: number } {
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const rx = ln.dx * cr + ln.dz * sr;
  const rz = -ln.dx * sr + ln.dz * cr;
  const ct = Math.cos(TILT);
  const st = Math.sin(TILT);
  const fy = ln.dy * ct - rz * st;
  const fz = ln.dy * st + rz * ct;
  return { fx: rx, fy, fz, persp: CAM / (CAM - fz) };
}

function seedLine(ln: Line, dim: Dim): void {
  const len = ln.lenFrac * dim.maxR;
  const p = project(ln, 0);
  ln.cx = dim.ox + p.fx * len * p.persp;
  ln.cy = dim.oy - p.fy * len * p.persp;
}

function paintBloom(ctx: CanvasRenderingContext2D, dim: Dim): void {
  const g = ctx.createRadialGradient(dim.ox, dim.oy, 0, dim.ox, dim.oy, dim.maxR * 0.72);
  g.addColorStop(0, 'rgba(255,255,255,0.13)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, dim.w, dim.h);
}

function paintLine(ctx: CanvasRenderingContext2D, dim: Dim, ln: Line, mouse: Mouse, t: number): void {
  // Always-on shimmer: a slow compound breathe on top of the 3D spin.
  const pulse =
    1 + Math.sin(t * 0.00045 + ln.phase) * 0.06 + Math.sin(t * 0.001 + ln.phase * 1.7) * 0.03;
  const len = ln.lenFrac * dim.maxR * pulse;
  const p = project(ln, t * ROT_SPEED);
  let tx = dim.ox + p.fx * len * p.persp;
  let ty = dim.oy - p.fy * len * p.persp;
  if (mouse.active) {
    const dx = tx - mouse.x;
    const dy = ty - mouse.y;
    const d = Math.hypot(dx, dy) || 0.001;
    if (d < INFLUENCE) {
      const f = (1 - d / INFLUENCE) * PUSH;
      tx += (dx / d) * f;
      ty += (dy / d) * f;
    }
  }
  ln.cx += (tx - ln.cx) * EASE;
  ln.cy += (ty - ln.cy) * EASE;
  // Depth: 0 = pointing away (dim/thin/small tip), 1 = toward viewer (bright/big).
  const depth = (p.fz + 1) / 2;
  const a = ln.alpha * (0.38 + 0.62 * depth);
  const tip = Math.min(96, ln.tipLight + depth * 18);
  const grad = ctx.createLinearGradient(dim.ox, dim.oy, ln.cx, ln.cy);
  grad.addColorStop(0, `hsla(0,0%,94%,${a})`);
  grad.addColorStop(1, `hsla(0,0%,${tip}%,${a})`);
  ctx.strokeStyle = grad;
  ctx.lineWidth = ln.width * (0.7 + depth * 0.6);
  ctx.beginPath();
  ctx.moveTo(dim.ox, dim.oy);
  ctx.lineTo(ln.cx, ln.cy);
  ctx.stroke();
  ctx.fillStyle = `hsla(0,0%,${Math.min(96, tip + 16)}%,${Math.min(1, a + 0.3)})`;
  ctx.beginPath();
  ctx.arc(ln.cx, ln.cy, ln.dot * (0.55 + depth * 0.9), 0, Math.PI * 2);
  ctx.fill();
}

export function createRadialBurst(container: HTMLElement): RadialBurst {
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('RadialBurst: 2d context unavailable');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const lines = buildLines();
  const mouse: Mouse = { x: 0, y: 0, active: false };
  const dim: Dim = { w: 0, h: 0, ox: 0, oy: 0, maxR: 0 };
  let raf = 0;

  const resize = () => {
    dim.w = container.clientWidth;
    dim.h = container.clientHeight;
    canvas.width = Math.max(1, Math.round(dim.w * dpr));
    canvas.height = Math.max(1, Math.round(dim.h * dpr));
    canvas.style.width = `${dim.w}px`;
    canvas.style.height = `${dim.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dim.ox = dim.w / 2;
    dim.oy = dim.h / 2;
    dim.maxR = Math.min(dim.w, dim.h) * 0.4; // headroom for the perspective scale
    for (const ln of lines) seedLine(ln, dim);
  };

  const draw = (t: number) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, dim.w, dim.h);
    paintBloom(ctx, dim);
    ctx.globalCompositeOperation = 'lighter';
    for (const ln of lines) paintLine(ctx, dim, ln, mouse, t);
    ctx.globalCompositeOperation = 'source-over';
  };

  const loop = (t: number) => {
    draw(t);
    raf = requestAnimationFrame(loop);
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  return {
    resize,
    start: () => {
      if (!raf) raf = requestAnimationFrame(loop);
    },
    stop,
    renderStill: () => draw(0),
    setMouse: (x, y) => {
      mouse.x = x;
      mouse.y = y;
      mouse.active = true;
    },
    clearMouse: () => {
      mouse.active = false;
    },
    dispose: () => {
      stop();
      canvas.remove();
    },
  };
}
