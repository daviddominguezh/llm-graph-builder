'use client';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { FileTypeIcon } from './FileTypeIcon';
import { LanguageMultiSelect } from './LanguageMultiSelect';
import type { OcrMode, StagedFile, StagedStatus } from './useStagedFiles';

interface StagedFileRowProps {
  staged: StagedFile;
  locked: boolean;
  onRemove: () => void;
  onOcrChange: (enabled: boolean) => void;
  onOcrModeChange: (mode: OcrMode) => void;
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
      {t(status)}
      <Loader2 className="size-3 animate-spin" />
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

interface OcrModeRadiosProps {
  groupName: string;
  mode: OcrMode;
  modeLocked: boolean;
  disabled: boolean;
  onChange: (mode: OcrMode) => void;
}

interface OcrModeOption {
  value: OcrMode;
  labelKey: 'ocrModeStandard' | 'ocrModeAdvanced';
}

const OCR_MODE_OPTIONS: readonly OcrModeOption[] = [
  { value: 'standard', labelKey: 'ocrModeStandard' },
  { value: 'advanced', labelKey: 'ocrModeAdvanced' },
];

function isOptionDisabled(option: OcrModeOption, disabled: boolean, modeLocked: boolean): boolean {
  if (disabled) return true;
  return option.value === 'standard' && modeLocked;
}

function OcrModeRadios({
  groupName,
  mode,
  modeLocked,
  disabled,
  onChange,
}: OcrModeRadiosProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  return (
    <div
      className="inline-flex items-center gap-3 text-xs"
      title={modeLocked ? t('ocrModeAdvancedForced') : undefined}
    >
      {OCR_MODE_OPTIONS.map((opt) => {
        const isDisabled = isOptionDisabled(opt, disabled, modeLocked);
        return (
          <label
            key={opt.value}
            className={`flex items-center gap-1.5 ${isDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
          >
            <input
              type="radio"
              name={groupName}
              value={opt.value}
              checked={mode === opt.value}
              disabled={isDisabled}
              onChange={() => onChange(opt.value)}
              className="size-3.5 accent-primary cursor-[inherit]"
            />
            <span>{t(opt.labelKey)}</span>
          </label>
        );
      })}
    </div>
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

interface OcrControlsRowProps {
  staged: StagedFile;
  rowLocked: boolean;
  onOcrChange: (enabled: boolean) => void;
  onOcrModeChange: (mode: OcrMode) => void;
  onLanguagesChange: (next: string[]) => void;
}

function OcrControlsRow({
  staged,
  rowLocked,
  onOcrChange,
  onOcrModeChange,
  onLanguagesChange,
}: OcrControlsRowProps): React.JSX.Element {
  const showModeTabs = staged.ocrEnabled;
  const showLanguages = staged.ocrEnabled && staged.ocrMode === 'standard';
  return (
    <div className={`flex min-h-[28px] items-center gap-3 ${rowLocked ? 'invisible' : ''}`}>
      {!staged.ocrLocked && (
        <OcrToggle enabled={staged.ocrEnabled} disabled={rowLocked} onChange={onOcrChange} />
      )}
      {showModeTabs && (
        <OcrModeRadios
          groupName={`ocr-mode-${staged.key}`}
          mode={staged.ocrMode}
          modeLocked={staged.ocrModeLocked}
          disabled={rowLocked}
          onChange={onOcrModeChange}
        />
      )}
      {showLanguages && (
        <div className="w-[255px] shrink-0">
          <LanguageMultiSelect
            selected={staged.languages}
            disabled={rowLocked}
            onChange={onLanguagesChange}
          />
        </div>
      )}
    </div>
  );
}

export function StagedFileRow({
  staged,
  locked,
  onRemove,
  onOcrChange,
  onOcrModeChange,
  onLanguagesChange,
}: StagedFileRowProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  const inProgress = IN_PROGRESS.has(staged.status);
  const rowLocked = locked || staged.status !== 'idle';
  return (
    <div className="flex flex-col gap-2 px-2 py-3">
      <div className="flex items-center gap-3">
        <FileTypeIcon mimeType={staged.file.type} filename={staged.file.name} />
        <FilenameBlock filename={staged.file.name} size={staged.file.size} />
        <div className="flex-1" />
        <StatusPill status={staged.status} error={staged.error} />
        <Button
          variant="destructive"
          size="icon-sm"
          type="button"
          aria-label={t('remove')}
          onClick={onRemove}
          disabled={locked}
          className={inProgress ? 'invisible' : ''}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {!staged.plainExtraction && !staged.imageEmbedding && (
        <OcrControlsRow
          staged={staged}
          rowLocked={rowLocked}
          onOcrChange={onOcrChange}
          onOcrModeChange={onOcrModeChange}
          onLanguagesChange={onLanguagesChange}
        />
      )}
    </div>
  );
}
