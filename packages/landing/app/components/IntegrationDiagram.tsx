import openflowLogo from '@/app/openflowLogoFullWhite.png';
import { ClipboardList, Database, Globe, type LucideIcon, Search, Table } from 'lucide-react';
import Image from 'next/image';

// Leaf label → icon: a file under /icons, or a lucide component.
const ICONS: Record<string, string | LucideIcon> = {
  WhatsApp: 'whatsapp.svg',
  Instagram: 'instagram.svg',
  Telegram: 'telegram.svg',
  Slack: 'slack.svg',
  Teams: 'teams.svg',
  'Google Chats': 'googlechat.svg',
  Discord: 'discord.svg',
  HTTP: Globe,
  'HTTP Requests': Globe,
  'KV database': Table,
  'External SQL DB': Database,
  'Web search': Search,
  Forms: ClipboardList,
  STDIO: 'stdio.svg',
  SSE: 'sse.svg',
  RAGs: 'rag.svg',
  Subagents: 'subagents.svg',
  Subroutines: 'subroutines.svg',
  CRONs: 'crons.svg',
  Webhooks: 'webhooks.svg',
  GitHub: 'github.svg',
  Notion: 'notion.svg',
  Zapier: 'zapier.svg',
  Stripe: 'stripe.svg',
  HubSpot: 'hubspot.svg',
};

// OpenFlow integration map, node-graph style: OpenFlow in the center with
// dashed connectors to each category box, and each category branching to its
// item boxes. Channels sits on top, Out-of-the-box MCPs on the bottom (items
// in horizontal rows); the other four categories flank the sides, two per
// side (items fan vertically). Pure divs + one SVG connector layer.
type Category = { name: string; items: string[] };

const TOP: Category = {
  name: 'Channels',
  items: ['WhatsApp', 'Instagram', 'Telegram', 'Slack', 'Teams', 'Google Chats', 'Discord'],
};
const BOTTOM: Category = {
  name: 'Out-of-the-box MCPs',
  items: ['GitHub', 'Notion', 'Slack', 'Zapier', 'Stripe', 'HubSpot', '30+ more'],
};
const LEFT: Category[] = [
  { name: 'Any MCP server', items: ['HTTP', 'STDIO', 'SSE'] },
  { name: 'Databases', items: ['RAGs', 'KV database', 'External SQL DB'] },
];
const RIGHT: Category[] = [
  { name: 'Orchestration', items: ['Subagents', 'Subroutines', 'CRONs', 'Webhooks'] },
  { name: 'Internal tools', items: ['Web search', 'HTTP Requests', 'Forms'] },
];

const VW = 1400;
const CX = 700;
const ITEM_H = 46;
const CAT_GAP = 30;

const zoneH = (cats: Category[]) =>
  cats.reduce((s, c) => s + c.items.length * ITEM_H, 0) + (cats.length - 1) * CAT_GAP;
const MID_H = Math.max(zoneH(LEFT), zoneH(RIGHT));
const VH = 420 + MID_H;
const CY = VH / 2;

type Node = {
  label: string;
  x: number;
  y: number;
  kind: 'center' | 'cat' | 'item';
  cat?: string;
  centered?: boolean;
};

function roundedPath(pts: number[][], r: number): string {
  let d = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx, cy] = pts[i]!;
    const [px, py] = pts[i - 1]!;
    const [nx, ny] = pts[i + 1]!;
    const bx = cx! + (px! - cx! ? Math.sign(px! - cx!) * r : 0);
    const by = cy! + (py! - cy! ? Math.sign(py! - cy!) * r : 0);
    const ax = cx! + (nx! - cx! ? Math.sign(nx! - cx!) * r : 0);
    const ay = cy! + (ny! - cy! ? Math.sign(ny! - cy!) * r : 0);
    d += ` L ${bx} ${by} Q ${cx} ${cy} ${ax} ${ay}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d} L ${last[0]} ${last[1]}`;
}

function buildSideZone(cats: Category[], dir: -1 | 1) {
  const itemX = dir < 0 ? 90 : 1310;
  const centerEdge = CX + dir * 66;
  const itemIn = itemX - dir * 62.5; // half of the 125px leaf width
  const catX = (centerEdge + itemIn) / 2; // category centred -> equal gaps both sides
  const catIn = catX - dir * 85;
  const catOut = catX + dir * 85;
  const midCC = (centerEdge + catIn) / 2;
  const midCI = (catOut + itemIn) / 2;
  const nodes: Node[] = [];
  const paths: string[] = [];
  let y = CY - zoneH(cats) / 2;
  for (const cat of cats) {
    const catY = y + (cat.items.length * ITEM_H) / 2;
    nodes.push({ label: cat.name, x: catX, y: catY, kind: 'cat' });
    paths.push(
      roundedPath(
        [
          [centerEdge, CY],
          [midCC, CY],
          [midCC, catY],
          [catIn, catY],
        ],
        12
      )
    );
    cat.items.forEach((label, i) => {
      const iy = y + i * ITEM_H + ITEM_H / 2;
      nodes.push({ label, x: itemX, y: iy, kind: 'item', cat: cat.name });
      paths.push(
        roundedPath(
          [
            [catOut, catY],
            [midCI, catY],
            [midCI, iy],
            [itemIn, iy],
          ],
          12
        )
      );
    });
    y += cat.items.length * ITEM_H + CAT_GAP;
  }
  return { nodes, paths };
}

function buildStackZone(cat: Category, dir: -1 | 1) {
  const itemY = dir < 0 ? 62 : VH - 62;
  const centerEdge = CY + dir * 34;
  const itemIn = itemY - dir * 16;
  const catY = (centerEdge + itemIn) / 2; // category centred -> equal gaps both sides
  const catIn = catY - dir * 22;
  const catOut = catY + dir * 22;
  const midY = (catOut + itemIn) / 2;
  const spacing = 160;
  const startX = CX - ((cat.items.length - 1) * spacing) / 2;
  const nodes: Node[] = [{ label: cat.name, x: CX, y: catY, kind: 'cat' }];
  const paths: string[] = [
    roundedPath(
      [
        [CX, centerEdge],
        [CX, catIn],
      ],
      12
    ),
  ];
  cat.items.forEach((label, i) => {
    const ix = startX + i * spacing;
    nodes.push({ label, x: ix, y: itemY, kind: 'item', cat: cat.name, centered: true });
    paths.push(
      roundedPath(
        [
          [CX, catOut],
          [CX, midY],
          [ix, midY],
          [ix, itemIn],
        ],
        12
      )
    );
  });
  return { nodes, paths };
}

const ZONES = [
  buildSideZone(LEFT, -1),
  buildSideZone(RIGHT, 1),
  buildStackZone(TOP, -1),
  buildStackZone(BOTTOM, 1),
];
const NODES: Node[] = [{ label: 'OpenFlow', x: CX, y: CY, kind: 'center' }, ...ZONES.flatMap((z) => z.nodes)];
const PATHS = ZONES.flatMap((z) => z.paths);

function NodeBox({ node }: { node: Node }) {
  const style = { left: `${(node.x / VW) * 100}%`, top: `${(node.y / VH) * 100}%` };
  if (node.kind === 'item') {
    const icon = ICONS[node.label];
    const Icon = icon && typeof icon !== 'string' ? icon : null;
    return (
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={style}>
        <div
          className={`flex w-[125px] items-center gap-1.5 rounded-md border border-white/10 bg-[#1c1e26] px-2 py-1.5 text-[11px] whitespace-nowrap text-white/85 ${node.centered ? 'justify-center' : 'justify-start'}`}
        >
          {typeof icon === 'string' && (
            <Image
              src={`/icons/${icon}`}
              alt=""
              width={17}
              height={17}
              className="h-[17px] w-[17px] shrink-0 object-contain"
            />
          )}
          {Icon && <Icon className="h-[17px] w-[17px] shrink-0 text-[#d0d3da]" strokeWidth={1.6} />}
          {node.label}
        </div>
      </div>
    );
  }
  if (node.kind === 'center') {
    return (
      <div className="border border-white/10 rounded-xl absolute -translate-x-1/2 -translate-y-1/2" style={style}>
        <div className="flex items-center justify-center rounded-xl bg-black px-6 py-5 shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
          <Image src={openflowLogo} alt="OpenFlow" height={24} className="h-6 w-auto" />
        </div>
      </div>
    );
  }
  return (
    <div className="border border-white/10 rounded-lg absolute -translate-x-1/2 -translate-y-1/2" style={style}>
      <span className="block w-[170px] rounded-lg bg-[#15161c] px-3.5 py-2 text-center text-sm font-medium whitespace-nowrap text-white">
        {node.label}
      </span>
    </div>
  );
}

export function IntegrationDiagram() {
  return (
    <div className="relative w-full" style={{ aspectRatio: `${VW} / ${VH}` }}>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {PATHS.map((d, i) => (
          <path
            key={i}
            className="connector-flow"
            d={d}
            fill="none"
            stroke="#5c5e6a"
            strokeWidth={1.5}
            strokeDasharray="3 6"
            strokeLinecap="round"
          />
        ))}
      </svg>
      {NODES.map((node) => (
        <NodeBox key={`${node.kind}-${node.label}-${Math.round(node.x)}-${Math.round(node.y)}`} node={node} />
      ))}
    </div>
  );
}
