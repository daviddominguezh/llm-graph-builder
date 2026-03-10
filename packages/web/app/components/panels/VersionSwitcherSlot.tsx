'use client';

import { restoreVersion } from '@/app/lib/graphApi';
import type { UseVersionsReturn } from '@/app/hooks/useVersions';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { VersionSelector } from './VersionSelector';

export interface VersionSwitcherSlotProps {
  agentId: string;
  versionsHook: UseVersionsReturn;
  hasPendingOps: boolean;
  clearQueue: () => void;
  reload: () => void;
}

export function VersionSwitcherSlot(props: VersionSwitcherSlotProps) {
  const { agentId, versionsHook, hasPendingOps, clearQueue, reload } = props;
  const t = useTranslations('editor');

  const handleSwitchVersion = useCallback(
    async (version: number) => {
      try {
        await restoreVersion(agentId, version);
        clearQueue();
        reload();
        versionsHook.setCurrentVersion(version);
      } catch {
        toast.error(t('restoreVersionFailed'));
      }
    },
    [agentId, clearQueue, reload, versionsHook, t]
  );

  return (
    <VersionSelector
      versions={versionsHook.versions}
      currentVersion={versionsHook.currentVersion}
      loading={versionsHook.loading}
      hasPendingOps={hasPendingOps}
      onSwitchVersion={handleSwitchVersion}
    />
  );
}
