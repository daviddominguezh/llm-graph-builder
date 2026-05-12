'use client';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { FileTypeIcon } from './FileTypeIcon';
import { LanguageMultiSelect } from './LanguageMultiSelect';
import type { StagedFile, StagedStatus } from './useStagedFiles';

interface StagedFileRowProps {
  staged: StagedFile;
  locked: boolean;
  onRemove: () => void;
  onOcrChange: (enabled: boolean) => void;
  onLanguagesChange: (next: string[]) => void;
}

const BYTES_KB = 1024;
const ONE_DECIMAL = 1;
const IN_PROGRESS: ReadonlySet<StagedStatus> = new Set([
  'uploading',
  'parsing',
  'chunking',
  'embedding',
]);

function formatBytes(n: number): string {
  if (n < BYTES_KB) return `${String(n)} B`;
  const kb = n / BYTES_KB;
  if (kb < BYTES_KB) return `${kb.toFixed(ONE_DECIMAL)} KB`;
  const mb = kb / BYTES_KB;
  return `${mb.toFixed(ONE_DECIMAL)} MB`;
}

function StatusPill({
  status,
  error,
}: {
  status: StagedStatus;
  error: string | null;
}): React.JSX.Element | null {
  const t = useTranslations('knowledgeBase.ragStatus');
  const tu = useTranslations('knowledgeBase.ragUpload');
  if (status === 'idle') return null;
  if (status === 'done') {
    return <span className="text-[10px] font-mono text-emerald-600">{t('done')}</span>;
  }
  if (status === 'failed') {
    const title = error ?? t('failed');
    return (
      <span className="text-[10px] font-mono text-destructive" title={title}>
        {tu('errorPrefix')}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-mono text-blue-500">
      <Loader2 className="size-3 animate-spin" />
      {t(status)}
    </span>
  );
}

interface ControlsProps {
  staged: StagedFile;
  locked: boolean;
  onOcrChange: (enabled: boolean) => void;
  onLanguagesChange: (next: string[]) => void;
}

function StagedControls({
  staged,
  locked,
  onOcrChange,
  onLanguagesChange,
}: ControlsProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  const ocrTitle = staged.ocrLocked ? t('imageOcrForced') : undefined;
  return (
    <div className="flex flex-wrap items-center gap-3 pl-9">
      <label
        className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground"
        title={ocrTitle}
      >
        <Switch
          size="sm"
          checked={staged.ocrEnabled}
          disabled={staged.ocrLocked || locked}
          onCheckedChange={(v) => onOcrChange(v)}
        />
        <span>{staged.ocrEnabled ? t('ocrEnabled') : t('ocrDisabled')}</span>
      </label>
      <div className="min-w-0 flex-1">
        <LanguageMultiSelect
          selected={staged.languages}
          disabled={locked}
          onChange={onLanguagesChange}
        />
      </div>
    </div>
  );
}

export function StagedFileRow({
  staged,
  locked,
  onRemove,
  onOcrChange,
  onLanguagesChange,
}: StagedFileRowProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  const inProgress = IN_PROGRESS.has(staged.status);
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center gap-3">
        <FileTypeIcon mimeType={staged.file.type} filename={staged.file.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-mono font-medium">{staged.file.name}</div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {formatBytes(staged.file.size)}
          </div>
        </div>
        <StatusPill status={staged.status} error={staged.error} />
        {!inProgress && (
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label={t('remove')}
            onClick={onRemove}
            disabled={locked}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      <StagedControls
        staged={staged}
        locked={locked}
        onOcrChange={onOcrChange}
        onLanguagesChange={onLanguagesChange}
      />
    </div>
  );
}
