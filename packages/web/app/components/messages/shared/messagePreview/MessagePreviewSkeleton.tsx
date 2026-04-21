import React from 'react';

interface MessagePreviewSkeletonProps {
  index: number;
}

/**
 * Placeholder for MessagePreview during the initial chat-list load.
 * Mirrors MessagePreview's outer dimensions (mx-1.5, py-1.5, 30px avatar,
 * two text rows) so no layout jumps when real data arrives.
 *
 * Animation style matches the dashboard chart skeletons: staggered fade-in
 * on the row, per-shape pulse on each `bg-border` block.
 */
export const MessagePreviewSkeleton: React.FC<MessagePreviewSkeletonProps> = ({ index }) => {
  const delay = `${index * 80}ms`;
  return (
    <div
      className="shrink-0 relative mx-1.5 w-[calc(100%-var(--spacing)*3)] overflow-hidden py-1.5 rounded-md animate-in fade-in fill-mode-both"
      style={{ animationDelay: delay, animationDuration: '400ms' }}
      aria-hidden="true"
    >
      <div className="flex w-full items-center overflow-hidden py-1 pl-1.5 pr-3 border-l-2 border-transparent">
        <div className="w-[30px] h-[30px] rounded-full bg-border shrink-0 animate-pulse" />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0 ml-3">
          <div className="flex items-center justify-between gap-2">
            <div className="h-3 w-24 rounded bg-border animate-pulse" />
            <div className="h-2 w-8 rounded bg-border shrink-0 animate-pulse" />
          </div>
          <div className="h-2.5 w-3/4 rounded bg-border animate-pulse" />
        </div>
      </div>
    </div>
  );
};

MessagePreviewSkeleton.displayName = 'MessagePreviewSkeleton';
