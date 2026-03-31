'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { getGitHubConnectUrl } from '@/app/actions/vfsConfig';
import type { OrgInfo } from './VfsConfigTable';
import { VfsConfigTable } from './VfsConfigTable';
import { VfsSettingsPanel } from './VfsSettingsPanel';
import type { RepoOption } from './VfsConfigRow';
import { useVfsConfigState } from './useVfsConfigState';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VfsConfigSectionProps {
  agentId: string;
  organizations: OrgInfo[];
}

/* ------------------------------------------------------------------ */
/*  Repo loading hook                                                  */
/* ------------------------------------------------------------------ */

function useRepoMap(organizations: OrgInfo[]) {
  const [repos, setRepos] = useState<Map<number, RepoOption[]>>(new Map());

  useEffect(() => {
    void loadRepos(organizations, setRepos);
  }, [organizations]);

  return repos;
}

interface GitHubRepoApiItem {
  id: number;
  full_name: string;
}

interface GitHubRepoListApiResponse {
  repositories?: GitHubRepoApiItem[];
}

function mapApiRepos(data: GitHubRepoListApiResponse): RepoOption[] {
  return (data.repositories ?? []).map((r) => ({ repoId: r.id, repoFullName: r.full_name }));
}

async function loadReposForInstallation(installId: number): Promise<RepoOption[]> {
  const { fetchFromBackend } = await import('@/app/lib/backendProxy');
  const path = `/github/installations/${String(installId)}/repos`;
  const data = (await fetchFromBackend('GET', path)) as GitHubRepoListApiResponse;
  return mapApiRepos(data);
}

async function loadRepos(
  organizations: OrgInfo[],
  setRepos: (val: Map<number, RepoOption[]>) => void
): Promise<void> {
  const withInstall = organizations.filter((org) => org.installationId !== null);
  const entries = await Promise.all(
    withInstall.map(async (org) => {
      const installId = org.installationId;
      if (installId === null) return null;
      try {
        const repoList = await loadReposForInstallation(installId);
        return [installId, repoList] as const;
      } catch {
        return null;
      }
    })
  );

  const map = new Map<number, RepoOption[]>();
  for (const entry of entries) {
    if (entry !== null) map.set(entry[0], entry[1]);
  }
  setRepos(map);
}

/* ------------------------------------------------------------------ */
/*  Connect handler                                                    */
/* ------------------------------------------------------------------ */

function useConnectHandler() {
  return useCallback(async (orgId: string) => {
    const url = await getGitHubConnectUrl(orgId);
    if (url !== null) window.location.href = url;
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function VfsConfigSection({ agentId, organizations }: VfsConfigSectionProps) {
  const t = useTranslations('vfsConfig');
  const state = useVfsConfigState(agentId);
  const repos = useRepoMap(organizations);
  const handleConnect = useConnectHandler();

  const isEnabled = state.settings !== null;

  if (state.loading) {
    return <LoadingState t={t} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id="vfs-enabled"
          checked={isEnabled}
          onCheckedChange={(checked) => state.handleToggleEnabled(checked === true)}
        />
        <div className="flex flex-col">
          <Label htmlFor="vfs-enabled" className="text-xs font-medium cursor-pointer">
            {t('enableVfs')}
          </Label>
          <span className="text-[11px] text-muted-foreground">{t('enableVfsDescription')}</span>
        </div>
      </div>
      {isEnabled && (
        <EnabledContent
          state={state}
          organizations={organizations}
          repos={repos}
          handleConnect={handleConnect}
          t={t}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Enabled content                                                    */
/* ------------------------------------------------------------------ */

function EnabledContent({ state, organizations, repos, handleConnect, t }: {
  state: ReturnType<typeof useVfsConfigState>;
  organizations: OrgInfo[];
  repos: Map<number, RepoOption[]>;
  handleConnect: (orgId: string) => void;
  t: (key: string) => string;
}) {
  if (organizations.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('noTenants')}</p>;
  }

  return (
    <>
      <Label className="text-xs font-medium">{t('sectionTitle')}</Label>
      <div className="rounded-md border">
        <VfsConfigTable
          configs={state.configs}
          organizations={organizations}
          repos={repos}
          onSelectRepo={state.handleUpsertConfig}
          onRemove={state.handleDeleteConfig}
          onConnect={handleConnect}
        />
      </div>
      {state.settings !== null && (
        <VfsSettingsPanel settings={state.settings} onUpdate={state.handleUpdateSettings} />
      )}
    </>
  );
}

function LoadingState({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-medium">{t('sectionTitle')}</Label>
      <p className="text-xs text-muted-foreground">{t('loadingConfigs')}</p>
    </div>
  );
}
