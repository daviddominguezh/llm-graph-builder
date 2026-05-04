import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading(): React.JSX.Element {
  return (
    <div className="h-[calc(100%-var(--spacing)*2.5)] overflow-hidden p-6 border rounded-xl mr-2.5 bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Skeleton className="dark:bg-input/50 bg-muted h-8 w-48" />
        <Skeleton className="dark:bg-input/50 bg-muted h-32 w-full" />
        <Skeleton className="dark:bg-input/50 bg-muted h-32 w-full" />
        <Skeleton className="dark:bg-input/50 bg-muted h-24 w-full" />
      </div>
    </div>
  );
}
