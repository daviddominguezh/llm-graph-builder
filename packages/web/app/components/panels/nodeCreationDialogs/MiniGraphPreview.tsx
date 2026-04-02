'use client';

const COLORS = {
  green: { line: 'stroke-green-500', fill: 'fill-green-500', tint: 'bg-green-500/10 border-green-500/30' },
  purple: { line: 'stroke-purple-500', fill: 'fill-purple-500', tint: 'bg-purple-500/10 border-purple-500/30' },
  orange: { line: 'stroke-orange-500', fill: 'fill-orange-500', tint: 'bg-orange-500/10 border-orange-500/30' },
  muted: { line: 'stroke-muted-foreground/40', fill: 'fill-muted-foreground/40', tint: 'bg-muted border-border' },
} as const;

type PreviewColor = keyof typeof COLORS;

interface NodeBoxProps {
  label: string;
  variant?: 'source' | 'new';
  tintColor?: PreviewColor;
  stretch?: boolean;
  className?: string;
}

function NodeBox({ label, variant = 'source', tintColor, stretch, className }: NodeBoxProps) {
  const isNew = variant === 'new';
  const height = stretch ? 'min-h-9' : 'h-9';
  const base = `flex ${height} items-center justify-center rounded-md border px-3 text-[10px] font-medium`;
  const visual = isNew && tintColor
    ? `border-dashed ${COLORS[tintColor].tint}`
    : 'border-border bg-card text-foreground shadow-sm';

  return (
    <div className={`${base} ${visual} ${className ?? ''}`}>
      <span className="max-w-[80px] truncate">{label}</span>
    </div>
  );
}

function ArrowLine({ color }: { color: PreviewColor }) {
  return (
    <svg viewBox="0 0 40 10" className="h-2.5 w-10 shrink-0">
      <line x1="0" y1="5" x2="32" y2="5" className={COLORS[color].line} strokeWidth="1.5" />
      <polygon points="32,1 40,5 32,9" className={COLORS[color].fill} />
    </svg>
  );
}

export function SingleEdgePreview({ sourceLabel, color }: { sourceLabel: string; color: PreviewColor }) {
  return (
    <div className="flex items-center gap-1.5 py-4 px-2 justify-center">
      <NodeBox label={sourceLabel} />
      <ArrowLine color={color} />
      <NodeBox label="New node" variant="new" tintColor={color} />
    </div>
  );
}

export function IfElsePreview({ sourceLabel }: { sourceLabel: string }) {
  return (
    <div className="flex items-stretch gap-1.5 py-4 px-2 justify-center">
      <NodeBox label={sourceLabel} stretch />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <ArrowLine color="purple" />
          <NodeBox label="Branch A" variant="new" tintColor="purple" />
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowLine color="purple" />
          <NodeBox label="Branch B" variant="new" tintColor="purple" />
        </div>
      </div>
    </div>
  );
}

/* Loop layout (px): Node=76, Arrow=40, Gap=6 → Row=332
   Source center=38, LoopBody center=166 */
const LOOP_W = 332;
const LOOP_BACK_PATH = 'M 166,4 C 182,4 182,24 166,24 L 38,24 C 22,24 22,4 38,4';

export function LoopPreview({
  sourceLabel,
  connectionColor,
}: {
  sourceLabel: string;
  connectionColor: PreviewColor;
}) {
  return (
    <div className="flex flex-col items-center py-4 px-2">
      <div className="flex items-center gap-1.5" style={{ width: LOOP_W }}>
        <NodeBox label={sourceLabel} className="w-[76px]" />
        <ArrowLine color={connectionColor} />
        <NodeBox label="Loop Body" variant="new" tintColor="purple" className="w-[76px]" />
        <ArrowLine color="purple" />
        <NodeBox label="Exit" variant="new" tintColor="purple" className="w-[76px]" />
      </div>
      <svg viewBox="0 0 332 28" className="-mt-px" style={{ width: LOOP_W, height: 28 }}>
        <path d={LOOP_BACK_PATH} fill="none" className="stroke-purple-500" strokeWidth="1.5" strokeDasharray="4 2" />
        <polygon points="42,0 34,4 42,8" className="fill-purple-500" />
      </svg>
    </div>
  );
}
