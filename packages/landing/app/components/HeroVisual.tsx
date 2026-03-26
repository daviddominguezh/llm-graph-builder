const NODES = [
  { cx: 120, cy: 90, r: 7, delay: '0s', opacity: 0.35 },
  { cx: 260, cy: 50, r: 9, delay: '0.8s', opacity: 0.5 },
  { cx: 400, cy: 120, r: 14, delay: '0.3s', opacity: 0.7 },
  { cx: 540, cy: 60, r: 9, delay: '1.2s', opacity: 0.5 },
  { cx: 680, cy: 100, r: 7, delay: '0.5s', opacity: 0.35 },
  { cx: 310, cy: 200, r: 6, delay: '1.5s', opacity: 0.3 },
  { cx: 490, cy: 190, r: 8, delay: '0.9s', opacity: 0.4 },
] as const;

const EDGES = [
  { d: 'M120,90 Q190,40 260,50', delay: '0s' },
  { d: 'M260,50 Q330,70 400,120', delay: '0.4s' },
  { d: 'M400,120 Q470,60 540,60', delay: '0.8s' },
  { d: 'M540,60 Q610,50 680,100', delay: '1.2s' },
  { d: 'M400,120 Q340,170 310,200', delay: '0.6s' },
  { d: 'M400,120 Q460,160 490,190', delay: '1.0s' },
] as const;

function GraphNodes() {
  return (
    <>
      {NODES.map((node) => (
        <circle
          key={`${node.cx}-${node.cy}`}
          cx={node.cx}
          cy={node.cy}
          r={node.r}
          className="hero-node"
          fill="var(--color-primary)"
          opacity={node.opacity}
          style={{ animation: `node-float 4s ease-in-out ${node.delay} infinite, node-pulse 5s ease-in-out ${node.delay} infinite` }}
        />
      ))}
    </>
  );
}

function GraphEdges() {
  return (
    <>
      {EDGES.map((edge) => (
        <path
          key={edge.d}
          d={edge.d}
          className="hero-edge"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.5"
          strokeDasharray="6 6"
          opacity="0.2"
          style={{ animation: `edge-flow 2s linear ${edge.delay} infinite` }}
        />
      ))}
    </>
  );
}

export function HeroVisual() {
  return (
    <div className="relative mt-16 w-full max-w-2xl" aria-hidden="true">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse,transparent_30%,var(--color-background)_70%)]" />
      <svg viewBox="0 0 800 240" className="w-full" xmlns="http://www.w3.org/2000/svg">
        <GraphEdges />
        <GraphNodes />
      </svg>
    </div>
  );
}
