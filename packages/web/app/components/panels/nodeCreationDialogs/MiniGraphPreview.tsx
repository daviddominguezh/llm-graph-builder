'use client';

const COLORS = {
  green: { border: 'border-green-500', line: 'stroke-green-500', bg: 'bg-green-500' },
  purple: { border: 'border-purple-500', line: 'stroke-purple-500', bg: 'bg-purple-500' },
  orange: { border: 'border-orange-500', line: 'stroke-orange-500', bg: 'bg-orange-500' },
  muted: { border: 'border-muted-foreground/40', line: 'stroke-muted-foreground/40', bg: 'bg-muted-foreground/40' },
} as const;

type PreviewColor = keyof typeof COLORS;

interface NodeBoxProps {
  label: string;
  dashed?: boolean;
  className?: string;
}

function NodeBox({ label, dashed, className }: NodeBoxProps) {
  return (
    <div
      className={`flex h-9 items-center justify-center rounded-md border bg-background px-3 text-[10px] font-medium text-foreground ${
        dashed ? 'border-dashed border-muted-foreground/50' : 'border-border'
      } ${className ?? ''}`}
    >
      <span className="max-w-[80px] truncate">{label}</span>
    </div>
  );
}

interface ArrowLineProps {
  color: PreviewColor;
  className?: string;
}

function ArrowLine({ color, className }: ArrowLineProps) {
  return (
    <svg
      viewBox="0 0 40 10"
      className={`h-2.5 w-10 shrink-0 ${className ?? ''}`}
    >
      <line x1="0" y1="5" x2="32" y2="5" className={COLORS[color].line} strokeWidth="1.5" />
      <polygon points="32,1 40,5 32,9" className={`fill-current ${COLORS[color].line.replace('stroke-', 'text-')}`} />
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
      <NodeBox label="New node" dashed />
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <ArrowLine color="purple" />
          <NodeBox label="Branch A" dashed />
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowLine color="purple" />
          <NodeBox label="Branch B" dashed />
        </div>
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
        <NodeBox label="Loop Body" dashed />
        <ArrowLine color="purple" />
        <NodeBox label="Exit" dashed />
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
