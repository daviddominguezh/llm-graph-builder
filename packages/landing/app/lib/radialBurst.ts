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
  angle: number;
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

function buildLines(): Line[] {
  const lines: Line[] = [];
  for (let i = 0; i < LINE_COUNT; i++) {
    const base = i / LINE_COUNT;
    const jitter = (Math.random() - 0.5) * (1.6 / LINE_COUNT);
    const angle = (base + jitter) * Math.PI * 2; // full circle
    const lenFrac = 0.3 + Math.pow(Math.random(), 0.6) * 0.68;
    const dev = Math.abs(Math.cos(angle)); // 0 vertical → 1 horizontal
    lines.push({
      angle,
      lenFrac,
      width: 0.6 + Math.random() * 0.7,
      alpha: 0.36 + (1 - lenFrac / 1.12) * 0.4,
      tipLight: 62 + dev * 10 + Math.random() * 10,
      dot: 1 + Math.random() * 1.7,
      phase: Math.random() * Math.PI * 2,
      cx: 0,
      cy: 0,
    });
  }
  return lines;
}

function seedLine(ln: Line, dim: Dim): void {
  const len = ln.lenFrac * dim.maxR;
  ln.cx = dim.ox + Math.cos(ln.angle) * len;
  ln.cy = dim.oy - Math.sin(ln.angle) * len;
}

function paintBloom(ctx: CanvasRenderingContext2D, dim: Dim): void {
  const g = ctx.createRadialGradient(dim.ox, dim.oy, 0, dim.ox, dim.oy, dim.maxR * 0.72);
  g.addColorStop(0, 'rgba(255,255,255,0.13)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, dim.w, dim.h);
}

function paintLine(ctx: CanvasRenderingContext2D, dim: Dim, ln: Line, mouse: Mouse, t: number): void {
  const len = ln.lenFrac * dim.maxR * (1 + Math.sin(t * 0.0007 + ln.phase) * 0.015);
  let tx = dim.ox + Math.cos(ln.angle) * len;
  let ty = dim.oy - Math.sin(ln.angle) * len;
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
  const grad = ctx.createLinearGradient(dim.ox, dim.oy, ln.cx, ln.cy);
  grad.addColorStop(0, `hsla(0,0%,94%,${ln.alpha})`);
  grad.addColorStop(1, `hsla(0,0%,${ln.tipLight}%,${ln.alpha})`);
  ctx.strokeStyle = grad;
  ctx.lineWidth = ln.width;
  ctx.beginPath();
  ctx.moveTo(dim.ox, dim.oy);
  ctx.lineTo(ln.cx, ln.cy);
  ctx.stroke();
  ctx.fillStyle = `hsla(0,0%,${Math.min(92, ln.tipLight + 16)}%,${Math.min(1, ln.alpha + 0.28)})`;
  ctx.beginPath();
  ctx.arc(ln.cx, ln.cy, ln.dot, 0, Math.PI * 2);
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
    dim.maxR = Math.min(dim.w, dim.h) * 0.47;
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
