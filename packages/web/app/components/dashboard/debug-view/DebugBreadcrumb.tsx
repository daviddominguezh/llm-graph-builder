import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('dashboard');

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link href={`/orgs/${slug}/dashboard`} className="hover:text-foreground text-xs font-medium">
        {dashboardLabel}
      </Link>
      <ChevronRight className="size-3" />
      <Link href={`/orgs/${slug}/dashboard/${agentSlug}`} className="hover:text-foreground text-xs font-medium">
        {agentName}
      </Link>
      <ChevronRight className="size-3" />
      <span className="text-foreground text-xs font-medium cursor-default">
        {t('sessionDebug')} ({sessionId})
      </span>
    </nav>
  );
}
