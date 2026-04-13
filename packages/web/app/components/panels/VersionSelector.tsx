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
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Calendar, Clock, History } from 'lucide-react';
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface VersionItemProps {
  version: number;
  publishedAt: string;
}

function VersionItemLabel({ version, publishedAt }: VersionItemProps) {
  const t = useTranslations('editor');

  return (
    <span className="flex flex-col gap-1 py-0.5 pr-5">
      <span className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="h-4 bg-muted/40 group-focus:bg-background px-1.5 font-mono text-[9px] font-semibold tabular-nums"
        >
          {t('versionLabel', { version: String(version) })}
        </Badge>
        <span className="flex items-center gap-1 text-xs text-foreground">
          <Calendar aria-hidden="true" className="size-3 shrink-0" />
          {formatDate(publishedAt)}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className="h-4 border px-1.5 font-mono text-[9px] font-semibold invisible" aria-hidden="true">
          {t('versionLabel', { version: String(version) })}
        </span>
        <span className="flex items-center gap-1 text-xs text-foreground">
          <Clock aria-hidden="true" className="size-3 shrink-0" />
          {formatTime(publishedAt)}
        </span>
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
  const t = useTranslations('editor');

  return (
    <div className="flex items-center gap-1.5 rounded-full px-3 text-xs text-foreground">
      <History className="size-4" />
      <span className="font-bold cursor-default">{t('versionDraft')}</span>
    </div>
  );
}

export function VersionSelector(props: VersionSelectorProps) {
  const { versions, currentVersion, loading, hasPendingOps, onSwitchVersion } = props;
  const t = useTranslations('editor');
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);
  const triggerLabel = currentVersion === 0 ? t('versionDraft') : `v${currentVersion}`;

  const handleValueChange = useCallback(
    (raw: string | null) => {
      if (raw === null) return;
      const selectedVersion = Number(raw);
      if (Number.isNaN(selectedVersion) || selectedVersion === currentVersion) return;

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
      <Select value={String(currentVersion)} onValueChange={handleValueChange} disabled={loading}>
        <SelectTrigger
          size="sm"
          className="data-[size=sm]:h-auto border-0 bg-transparent px-3 text-xs font-bold [&>svg:last-child]:hidden hover:bg-card!"
        >
          <History className="size-4" />
          <span className='cursor-default'>{triggerLabel}</span>
        </SelectTrigger>
        <SelectContent side="bottom" align="end" alignItemWithTrigger={false} className="w-auto min-w-56">
          {versions.map((v) => (
            <SelectItem
              key={v.version}
              value={String(v.version)}
              
            >
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
