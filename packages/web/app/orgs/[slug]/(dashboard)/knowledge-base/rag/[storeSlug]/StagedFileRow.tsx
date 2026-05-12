'use client';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Loader2, Trash2 } from 'lucide-react';
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
    return <span className="text-[10px] text-emerald-600">{t('done')}</span>;
  }
  if (status === 'failed') {
    const title = error ?? t('failed');
    return (
      <span className="text-[10px] text-destructive" title={title}>
        {tu('errorPrefix')}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-blue-500">
      <Loader2 className="size-3 animate-spin" />
      {t(status)}
    </span>
  );
}

interface OcrToggleProps {
  enabled: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
}

function OcrToggle({ enabled, disabled, onChange }: OcrToggleProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-xs text-foreground">
      <Switch
        size="sm"
        checked={enabled}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v)}
      />
      <span>{t('ocrLabel')}</span>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={t('ocrTooltip')}
          className="cursor-help text-muted-foreground hover:text-foreground"
        >
          <Info className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{t('ocrTooltip')}</TooltipContent>
      </Tooltip>
    </label>
  );
}

interface FilenameBlockProps {
  filename: string;
  size: number;
}

function FilenameBlock({ filename, size }: FilenameBlockProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 max-w-[350px] items-baseline gap-2">
      <span className="min-w-0 truncate text-xs font-medium" title={filename}>
        {filename}
      </span>
      <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
        {formatBytes(size)}
      </span>
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
    <div className="flex items-center gap-3 border-b last:border-b-0 px-2 py-3">
      <FileTypeIcon mimeType={staged.file.type} filename={staged.file.name} />
      <FilenameBlock filename={staged.file.name} size={staged.file.size} />
      <div className="flex-1" />
      {!staged.ocrLocked && (
        <OcrToggle enabled={staged.ocrEnabled} disabled={locked} onChange={onOcrChange} />
      )}
      <div className="w-[255px] shrink-0">
        <LanguageMultiSelect
          selected={staged.languages}
          disabled={locked}
          onChange={onLanguagesChange}
        />
      </div>
      <StatusPill status={staged.status} error={staged.error} />
      {!inProgress && (
        <Button
          variant="destructive"
          size="icon-sm"
          type="button"
          aria-label={t('remove')}
          onClick={onRemove}
          disabled={locked}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
