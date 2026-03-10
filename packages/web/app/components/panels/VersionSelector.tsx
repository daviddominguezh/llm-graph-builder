'use client';

import type { VersionSummary } from '@/app/lib/graphApi';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

export interface VersionSelectorProps {
  versions: VersionSummary[];
  currentVersion: number;
  loading: boolean;
  hasPendingOps: boolean;
  onSwitchVersion: (version: number) => Promise<void>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function VersionItemLabel({ version, publishedAt }: { version: number; publishedAt: string }) {
  const t = useTranslations('editor');

  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-xs font-medium">{t('versionLabel', { version: String(version) })}</span>
      <span className="text-muted-foreground text-[10px]">
        {t('versionPublishedAt', { date: formatDate(publishedAt) })}
      </span>
    </span>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function SwitchConfirmDialog({ open, onConfirm, onCancel }: ConfirmDialogProps) {
  const t = useTranslations('editor');

  return (
    <AlertDialog open={open} onOpenChange={buildOpenChangeHandler(open, onCancel)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('switchVersionTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('switchVersionDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t('switchVersionCancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t('switchVersionConfirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function buildOpenChangeHandler(isOpen: boolean, onClose: () => void) {
  return (nextOpen: boolean) => {
    if (isOpen && !nextOpen) {
      onClose();
    }
  };
}

function EmptyVersionsTrigger() {
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs text-muted-foreground">
      <History className="size-3.5" />
      <span>v0</span>
    </div>
  );
}

export function VersionSelector(props: VersionSelectorProps) {
  const { versions, currentVersion, loading, hasPendingOps, onSwitchVersion } = props;
  const t = useTranslations('editor');

  const [pendingVersion, setPendingVersion] = useState<number | null>(null);

  const handleValueChange = useCallback(
    (selectedVersion: number | null) => {
      if (selectedVersion === null || selectedVersion === currentVersion) return;

      if (hasPendingOps) {
        setPendingVersion(selectedVersion);
        return;
      }

      void onSwitchVersion(selectedVersion);
    },
    [currentVersion, hasPendingOps, onSwitchVersion]
  );

  const handleConfirm = useCallback(() => {
    if (pendingVersion === null) return;
    const ver = pendingVersion;
    setPendingVersion(null);
    void onSwitchVersion(ver);
  }, [pendingVersion, onSwitchVersion]);

  const handleCancel = useCallback(() => {
    setPendingVersion(null);
  }, []);

  if (versions.length === 0) return <EmptyVersionsTrigger />;

  return (
    <>
      <Select value={currentVersion} onValueChange={handleValueChange} disabled={loading}>
        <SelectTrigger size="sm" className="h-8 min-w-[90px] text-xs">
          <History className="size-3.5" />
          <SelectValue placeholder={t('versionLabel', { version: String(currentVersion) })} />
        </SelectTrigger>
        <SelectContent side="bottom" align="end">
          {versions.map((v) => (
            <SelectItem key={v.version} value={v.version}>
              <VersionItemLabel version={v.version} publishedAt={v.publishedAt} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <SwitchConfirmDialog
        open={pendingVersion !== null}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
