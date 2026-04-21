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
    : 'border-border bg-input text-foreground shadow-sm';

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

/*
 * Loop layout (px at 16px root):
 *   Source=76  gap=6  Arrow=40  gap=6  LoopBody=96  gap=6  Arrow=40  gap=6  Exit=76
 *   Total row width = 352
 *   Source center   = 38
 *   LoopBody center = 76+6+40+6+48 = 176
 *
 * Back-arrow SVG spans full row width.
 * Path curves from LoopBody bottom-center down and left to Source bottom-center.
 */
const LOOP_W = 352;
const LOOP_BACK = 'M 176,0 L 176,12 C 176,20 168,24 160,24 L 54,24 C 46,24 38,20 38,12 L 38,0';

export function LoopPreview({
  sourceLabel,
  connectionColor,
}: {
  sourceLabel: string;
  connectionColor: PreviewColor;
}) {
  return (
    <div className="flex flex-col items-center py-4 px-2 shrink-0">
      <div className="flex items-center gap-1.5" style={{ width: LOOP_W }}>
        <NodeBox label={sourceLabel} className="w-[76px]" />
        <ArrowLine color={connectionColor} />
        <NodeBox label="Loop Body" variant="new" tintColor="purple" className="w-[96px]" />
        <ArrowLine color="purple" />
        <NodeBox label="Exit" variant="new" tintColor="purple" className="w-[76px]" />
      </div>
      <svg viewBox="0 0 352 26" style={{ width: LOOP_W, height: 26 }}>
        <path d={LOOP_BACK} fill="none" className="stroke-purple-500" strokeWidth="1.5" strokeDasharray="4 2">
          <animate attributeName="stroke-dashoffset" from="0" to="-6" dur="0.8s" repeatCount="indefinite" />
        </path>
        <polygon points="34,6 42,6 38,0" className="fill-purple-500" />
      </svg>
    </div>
  );
}
