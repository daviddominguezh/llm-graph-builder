const SKELETON_WIDTHS = ['60%', '45%', '70%', '40%', '55%'] as const;
const SKELETON_COUNT = 5;

function BubbleSkeleton({ index }: { index: number }) {
  const isRight = index % 2 === 0;
  const width = SKELETON_WIDTHS[index % SKELETON_WIDTHS.length];
  const delay = `${index * 80}ms`;

  return (
    <div
      className={`flex ${isRight ? 'justify-end' : 'justify-start'} animate-in fade-in fill-mode-both`}
      style={{ animationDelay: delay, animationDuration: '400ms' }}
    >
      <div
        className={`rounded-lg ${isRight ? 'rounded-tr-sm' : 'rounded-tl-sm'} bg-muted animate-pulse`}
        style={{ width, maxWidth: '280px', minWidth: '120px' }}
      >
        <div className="px-3 py-2.5 flex flex-col gap-1.5">
          <div className="h-2.5 w-full rounded bg-muted-foreground/10" />
          <div className="h-2.5 w-3/4 rounded bg-muted-foreground/10" />
          {index % 3 === 0 && <div className="h-2.5 w-1/2 rounded bg-muted-foreground/10" />}
          <div className="h-2 w-10 rounded bg-muted-foreground/10 self-end mt-0.5" />
        </div>
      </div>
    </div>
  );
}

interface MessageViewSkeletonProps {
  className?: string;
}

export function MessageViewSkeleton({ className }: MessageViewSkeletonProps) {
  return (
    <div className={`overflow-y-auto z-20 flex-1 flex flex-col justify-end p-4 gap-2 ${className}`}>
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <BubbleSkeleton key={i} index={i} />
      ))}
    </div>
  );
}
