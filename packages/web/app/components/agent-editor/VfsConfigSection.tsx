'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ChevronRight, GitBranch } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { fetchInstallationRepos, getGitHubConnectUrl } from '@/app/actions/vfsConfig';
import type { RepoOption } from '@/app/actions/vfsConfig';
import type { OrgInfo } from './VfsConfigTable';
import { VfsConfigTable } from './VfsConfigTable';
import { VfsSettingsPanel } from './VfsSettingsPanel';
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

async function loadRepos(
  organizations: OrgInfo[],
  setRepos: (val: Map<number, RepoOption[]>) => void
): Promise<void> {
  const withInstall = organizations.filter((org) => org.installationId !== null);
  const entries = await Promise.all(withInstall.map(loadRepoEntry));

  const map = new Map<number, RepoOption[]>();
  for (const entry of entries) {
    if (entry !== null) map.set(entry[0], entry[1]);
  }
  setRepos(map);
}

async function loadRepoEntry(org: OrgInfo): Promise<readonly [number, RepoOption[]] | null> {
  const installId = org.installationId;
  if (installId === null) return null;
  try {
    const repoList = await fetchInstallationRepos(installId);
    return [installId, repoList] as const;
  } catch {
    return null;
  }
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
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          <EnabledContent
            state={state}
            organizations={organizations}
            repos={repos}
            handleConnect={handleConnect}
            t={t}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                        */
/* ------------------------------------------------------------------ */

function NoTenantsState({ t }: { t: (key: string) => string }) {
  return (
    <div className="border border-ring/50 border-dashed rounded-md flex flex-col items-center gap-2 py-6 text-center bg-input/20">
      <GitBranch className="size-5 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">{t('noTenantsTitle')}</p>
      <p className="max-w-xs text-[11px] text-muted-foreground/70">{t('noTenantsDescription')}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Advanced settings toggle                                           */
/* ------------------------------------------------------------------ */

function AdvancedSettingsToggle({
  open,
  onToggle,
  t,
}: {
  open: boolean;
  onToggle: () => void;
  t: (key: string) => string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
    >
      <ChevronRight className={cn('size-3 transition-transform duration-150', open && 'rotate-90')} />
      {t('advancedSettings')}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Enabled content                                                    */
/* ------------------------------------------------------------------ */

function EnabledContent({
  state,
  organizations,
  repos,
  handleConnect,
  t,
}: {
  state: ReturnType<typeof useVfsConfigState>;
  organizations: OrgInfo[];
  repos: Map<number, RepoOption[]>;
  handleConnect: (orgId: string) => void;
  t: (key: string) => string;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (organizations.length === 0) {
    return <NoTenantsState t={t} />;
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
        <>
          <AdvancedSettingsToggle
            open={showAdvanced}
            onToggle={() => setShowAdvanced((prev) => !prev)}
            t={t}
          />
          {showAdvanced && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-150">
              <VfsSettingsPanel settings={state.settings} onUpdate={state.handleUpdateSettings} />
            </div>
          )}
        </>
      )}
    </>
  );
}

function LoadingState({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-medium">{t('sectionTitle')}</Label>
      <div className="rounded-md border p-3 space-y-2">
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-48 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
