import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface SessionBreadcrumbProps {
  slug: string;
  agentName: string;
  dashboardLabel: string;
}

export function SessionBreadcrumb({ slug, agentName, dashboardLabel }: SessionBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
      <Link href={`/orgs/${slug}/dashboard`} className="hover:text-foreground">
        {dashboardLabel}
      </Link>
      <ChevronRight className="size-3" />
      <span className="text-foreground font-medium">{agentName}</span>
    </nav>
  );
}
