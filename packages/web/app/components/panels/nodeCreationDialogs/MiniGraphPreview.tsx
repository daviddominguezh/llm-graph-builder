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
  className?: string;
}

function NodeBox({ label, variant = 'source', tintColor, className }: NodeBoxProps) {
  const isNew = variant === 'new';
  const base = 'flex h-9 items-center justify-center rounded-md border px-3 text-[10px] font-medium';
  const style = isNew && tintColor
    ? `${base} border-dashed ${COLORS[tintColor].tint}`
    : `${base} border-border bg-card text-foreground shadow-sm`;

  return (
    <div className={`${style} ${className ?? ''}`}>
      <span className="max-w-[80px] truncate">{label}</span>
    </div>
  );
}

function ArrowLine({ color, className }: { color: PreviewColor; className?: string }) {
  return (
    <svg viewBox="0 0 40 10" className={`h-2.5 w-10 shrink-0 ${className ?? ''}`}>
      <line x1="0" y1="5" x2="32" y2="5" className={COLORS[color].line} strokeWidth="1.5" />
      <polygon points="32,1 40,5 32,9" className={COLORS[color].fill} />
    </svg>
  );
}

interface SingleEdgePreviewProps {
  sourceLabel: string;
  color: PreviewColor;
}

export function SingleEdgePreview({ sourceLabel, color }: SingleEdgePreviewProps) {
  return (
    <div className="flex items-center gap-1.5 py-4 px-2 justify-center">
      <NodeBox label={sourceLabel} />
      <ArrowLine color={color} />
      <NodeBox label="New node" variant="new" tintColor={color} />
    </div>
  );
}

interface IfElsePreviewProps {
  sourceLabel: string;
}

export function IfElsePreview({ sourceLabel }: IfElsePreviewProps) {
  return (
    <div className="flex items-center gap-1.5 py-4 px-2 justify-center">
      <NodeBox label={sourceLabel} />
      {/* Fork connector */}
      <svg viewBox="0 0 20 50" className="h-14 w-5 shrink-0">
        <line x1="0" y1="25" x2="10" y2="25" className="stroke-purple-500" strokeWidth="1.5" />
        <line x1="10" y1="12" x2="10" y2="38" className="stroke-purple-500" strokeWidth="1.5" />
        <line x1="10" y1="12" x2="20" y2="12" className="stroke-purple-500" strokeWidth="1.5" />
        <line x1="10" y1="38" x2="20" y2="38" className="stroke-purple-500" strokeWidth="1.5" />
        <polygon points="17,9 20,12 17,15" className="fill-purple-500" />
        <polygon points="17,35 20,38 17,41" className="fill-purple-500" />
      </svg>
      <div className="flex flex-col gap-2">
        <NodeBox label="Branch A" variant="new" tintColor="purple" />
        <NodeBox label="Branch B" variant="new" tintColor="purple" />
      </div>
    </div>
  );
}

interface LoopPreviewProps {
  sourceLabel: string;
  connectionColor: PreviewColor;
}

export function LoopPreview({ sourceLabel, connectionColor }: LoopPreviewProps) {
  return (
    <div className="flex flex-col items-center gap-1 py-4 px-2">
      <div className="flex items-center gap-1.5">
        <NodeBox label={sourceLabel} />
        <ArrowLine color={connectionColor} />
        <NodeBox label="Loop Body" variant="new" tintColor="purple" />
        <ArrowLine color="purple" />
        <NodeBox label="Exit" variant="new" tintColor="purple" />
      </div>
      <svg viewBox="0 0 200 24" className="h-5 w-48 -mt-1">
        <path
          d="M140,2 C160,2 160,22 140,22 L60,22 C40,22 40,2 60,2"
          fill="none"
          className="stroke-purple-500"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />
        <polygon points="58,0 66,4 58,8" className="fill-purple-500" transform="translate(0,-2)" />
      </svg>
    </div>
  );
}
