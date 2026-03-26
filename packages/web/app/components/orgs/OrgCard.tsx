import type { OrgWithAgentCount } from '@/app/lib/orgs';
import { toProxyImageSrc } from '@/app/lib/supabase/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';

interface OrgCardProps {
  org: OrgWithAgentCount;
}

function OrgAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl !== null) {
    return <Image src={toProxyImageSrc(avatarUrl)} alt={name} width={48} height={48} className="h-12 w-12 rounded-full object-cover border" />;
  }

  return (
    <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full text-lg font-medium">
      {initial}
    </div>
  );
}

export function OrgCard({ org }: OrgCardProps) {
  const t = useTranslations('orgs');

  return (
    <Link href={`/orgs/${org.slug}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="flex flex-row items-center gap-3">
          <OrgAvatar name={org.name} avatarUrl={org.avatar_url} />
          <CardTitle>{org.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">{t('agentCount', { count: org.agent_count })}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
