'use client';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { useTranslations } from 'next-intl';

interface TemplateVersionSelectorProps {
  versions: number[];
  value: number;
  onValueChange: (version: number) => void;
}

function buildLabel(version: number, latest: number | undefined): string {
  return version === latest ? 'latest' : `v${String(version)}`;
}

export function TemplateVersionSelector({ versions, value, onValueChange }: TemplateVersionSelectorProps) {
  const t = useTranslations('marketplace');
  const anchorRef = useComboboxAnchor();
  const items = versions.map(String);
  const latest = versions[0];

  const displayLabel = value === latest ? t('latest') : t('version', { version: value });

  return (
    <Combobox
      items={items}
      value={String(value)}
      onValueChange={(v) => {
        if (v) onValueChange(Number(v));
      }}
      itemToStringLabel={(v) => buildLabel(Number(v), latest)}
    >
      <div ref={anchorRef} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="h-5 border-none bg-transparent text-[11px] text-muted-foreground transition-colors rounded-md hover:bg-card px-1 cursor-pointer"
        >
          {displayLabel}
        </button>
      </div>
      <ComboboxContent className="w-[120px]" align="end" anchor={anchorRef}>
        <ComboboxEmpty>{t('noResults')}</ComboboxEmpty>
        <ComboboxList>
          {(v) => (
            <ComboboxItem key={v} value={v}>
              {Number(v) === latest ? t('latest') : t('version', { version: Number(v) })}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
