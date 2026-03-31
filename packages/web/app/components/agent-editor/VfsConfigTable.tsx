'use client';

import { useTranslations } from 'next-intl';

import type { VfsConfigRow as VfsConfigRowData } from '@/app/actions/vfsConfig';
import type { RepoOption, VfsConfigRowProps } from './VfsConfigRow';
import { VfsConfigRow } from './VfsConfigRow';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OrgInfo {
  id: string;
  name: string;
  installationId: number | null;
}

export interface VfsConfigTableProps {
  configs: VfsConfigRowData[];
  organizations: OrgInfo[];
  repos: Map<number, RepoOption[]>;
  onSelectRepo: VfsConfigRowProps['onSelectRepo'];
  onRemove: (orgId: string) => void;
  onConnect: (orgId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findConfigForOrg(configs: VfsConfigRowData[], orgId: string): VfsConfigRowData | null {
  return configs.find((c) => c.org_id === orgId) ?? null;
}

function getReposForInstallation(repos: Map<number, RepoOption[]>, installId: number | null): RepoOption[] {
  if (installId === null) return [];
  return repos.get(installId) ?? [];
}

/* ------------------------------------------------------------------ */
/*  Table header                                                       */
/* ------------------------------------------------------------------ */

function TableHeader({ t }: { t: (key: string) => string }) {
  return (
    <thead>
      <tr className="border-b">
        <th className="px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground/70 whitespace-nowrap">{t('tenantColumn')}</th>
        <th className="px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground/70 whitespace-nowrap">{t('githubAccountColumn')}</th>
        <th className="px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground/70 whitespace-nowrap">{t('repositoryColumn')}</th>
        <th className="px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground/70 whitespace-nowrap">{t('statusColumn')}</th>
      </tr>
    </thead>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function VfsConfigTable(props: VfsConfigTableProps) {
  const t = useTranslations('vfsConfig');
  const { configs, organizations, repos, onSelectRepo, onRemove, onConnect } = props;

  return (
    <table className="w-full text-sm">
      <TableHeader t={t} />
      <tbody>
        {organizations.map((org) => (
          <VfsConfigRow
            key={org.id}
            orgId={org.id}
            orgName={org.name}
            config={findConfigForOrg(configs, org.id)}
            installationId={org.installationId}
            repos={getReposForInstallation(repos, org.installationId)}
            onSelectRepo={onSelectRepo}
            onRemove={onRemove}
            onConnect={onConnect}
          />
        ))}
      </tbody>
    </table>
  );
}
