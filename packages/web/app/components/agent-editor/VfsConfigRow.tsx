'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { RepoOption, VfsConfigRow as VfsConfigRowData } from '@/app/actions/vfsConfig';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type { RepoOption };

export interface VfsConfigRowProps {
  orgId: string;
  orgName: string;
  config: VfsConfigRowData | null;
  installationId: number | null;
  repos: RepoOption[];
  onSelectRepo: (orgId: string, installId: number, repoId: number, repoName: string) => void;
  onRemove: (orgId: string) => void;
  onConnect: (orgId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Status utilities                                                   */
/* ------------------------------------------------------------------ */

type RowStatus = 'connected' | 'pending' | 'error' | 'none';

function getRowStatus(config: VfsConfigRowData | null, installationId: number | null): RowStatus {
  if (installationId === null) return 'none';
  if (config === null) return 'pending';
  const status = config.installation_status;
  if (status === 'suspended' || status === 'revoked') return 'error';
  if (status === 'active' && config.repo_exists) return 'connected';
  return 'pending';
}

const STATUS_DOT_COLORS: Record<RowStatus, string> = {
  connected: 'bg-emerald-500',
  pending: 'bg-amber-500',
  error: 'bg-destructive',
  none: 'bg-muted-foreground/30',
};

function StatusDot({ status }: { status: RowStatus }) {
  return <span className={cn('inline-block size-1.5 rounded-full', STATUS_DOT_COLORS[status])} />;
}

function isErrorStatus(config: VfsConfigRowData | null): boolean {
  if (config === null) return false;
  const s = config.installation_status;
  return s === 'suspended' || s === 'revoked';
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ config, t }: { config: VfsConfigRowData; t: (key: string) => string }) {
  if (config.installation_status === 'suspended') {
    return <Badge variant="secondary">{t('suspended')}</Badge>;
  }
  if (config.installation_status !== 'active') {
    return <Badge variant="destructive">{t('revoked')}</Badge>;
  }
  if (!config.repo_exists) {
    return <Badge variant="secondary">{t('pending')}</Badge>;
  }
  return <Badge variant="default">{t('connected')}</Badge>;
}

/* ------------------------------------------------------------------ */
/*  Row states                                                         */
/* ------------------------------------------------------------------ */

function NoConnectionState({
  orgId,
  t,
  onConnect,
}: {
  orgId: string;
  t: (key: string) => string;
  onConnect: (orgId: string) => void;
}) {
  return (
    <>
      <td className="px-3 py-2 text-xs text-muted-foreground"><span className="text-muted-foreground/40">&mdash;</span></td>
      <td className="px-3 py-2 text-xs text-muted-foreground"><span className="text-muted-foreground/40">&mdash;</span></td>
      <td className="px-3 py-2">
        <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => onConnect(orgId)}>
          {t('connectGitHub')}
        </Button>
      </td>
    </>
  );
}

function RepoSelectState({
  orgId,
  installId,
  repos,
  t,
  onSelectRepo,
}: {
  orgId: string;
  installId: number;
  repos: RepoOption[];
  t: (key: string) => string;
  onSelectRepo: VfsConfigRowProps['onSelectRepo'];
}) {
  return (
    <td className="px-3 py-2" colSpan={2}>
      <Select
        onValueChange={(val) => {
          const repo = repos.find((r) => String(r.repoId) === val);
          if (repo !== undefined) onSelectRepo(orgId, installId, repo.repoId, repo.repoFullName);
        }}
      >
        <SelectTrigger className="h-7 text-xs w-60">
          <SelectValue placeholder={t('selectRepository')} />
        </SelectTrigger>
        <SelectContent>
          {repos.map((repo) => (
            <SelectItem key={repo.repoId} value={String(repo.repoId)}>
              {repo.repoFullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </td>
  );
}

function ConnectedState({
  config,
  orgId,
  t,
  onRemove,
  onConnect,
}: {
  config: VfsConfigRowData;
  orgId: string;
  t: (key: string) => string;
  onRemove: (orgId: string) => void;
  onConnect: (orgId: string) => void;
}) {
  const hasError = isErrorStatus(config);
  return (
    <>
      <td className="px-3 py-2 text-xs font-mono">{config.repo_full_name}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <StatusBadge config={config} t={t} />
          {hasError && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onConnect(orgId)}>
              {t('reconnectGitHub')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(orgId)}
            aria-label={t('removeConfig')}
          >
            <X className="size-3" />
          </Button>
        </div>
      </td>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function VfsConfigRow(props: VfsConfigRowProps) {
  const t = useTranslations('vfsConfig');
  const { orgId, orgName, config, installationId, repos, onSelectRepo, onRemove, onConnect } = props;

  const status = getRowStatus(config, installationId);
  const rowBg = isErrorStatus(config) ? 'bg-destructive/5' : '';

  return (
    <tr className={cn('border-b last:border-b-0', rowBg)}>
      <td className="px-3 py-2 text-xs font-medium">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          {orgName}
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {config?.account_name ?? <span className="text-muted-foreground/40">&mdash;</span>}
      </td>
      {renderRowContent(orgId, config, installationId, repos, t, onSelectRepo, onRemove, onConnect)}
    </tr>
  );
}

function renderRowContent(
  orgId: string,
  config: VfsConfigRowData | null,
  installationId: number | null,
  repos: RepoOption[],
  t: (key: string) => string,
  onSelectRepo: VfsConfigRowProps['onSelectRepo'],
  onRemove: (orgId: string) => void,
  onConnect: (orgId: string) => void
) {
  if (installationId === null) {
    return <NoConnectionState orgId={orgId} t={t} onConnect={onConnect} />;
  }
  if (config === null) {
    return (
      <RepoSelectState orgId={orgId} installId={installationId} repos={repos} t={t} onSelectRepo={onSelectRepo} />
    );
  }
  return <ConnectedState config={config} orgId={orgId} t={t} onRemove={onRemove} onConnect={onConnect} />;
}
