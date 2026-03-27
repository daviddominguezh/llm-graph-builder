import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface SessionBreadcrumbProps {
  slug: string;
  agentName: string;
  agentSlug: string;
  dashboardLabel: string;
}

export function SessionBreadcrumb({ slug, agentName, agentSlug, dashboardLabel }: SessionBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
      <Link href={`/orgs/${slug}/dashboard`} className="hover:text-foreground">
        {dashboardLabel}
      </Link>
      <ChevronRight className="size-3" />
      <Link href={`/orgs/${slug}/dashboard/${agentSlug}`} className="hover:text-foreground">
        {agentName}
      </Link>
    </nav>
  );
}
