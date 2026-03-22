import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface DebugBreadcrumbProps {
  slug: string;
  agentName: string;
  agentSlug: string;
  sessionId: string;
  dashboardLabel: string;
}

export function DebugBreadcrumb({
  slug,
  agentName,
  agentSlug,
  sessionId,
  dashboardLabel,
}: DebugBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
      <Link href={`/orgs/${slug}/dashboard`} className="hover:text-foreground">
        {dashboardLabel}
      </Link>
      <ChevronRight className="size-3" />
      <Link href={`/orgs/${slug}/dashboard/${agentSlug}`} className="hover:text-foreground">
        {agentName}
      </Link>
      <ChevronRight className="size-3" />
      <span className="text-foreground font-medium truncate max-w-48">{sessionId}</span>
    </nav>
  );
}
