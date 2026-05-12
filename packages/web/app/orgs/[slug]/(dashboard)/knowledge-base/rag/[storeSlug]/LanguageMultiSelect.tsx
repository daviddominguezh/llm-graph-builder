'use client';

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { useTranslations } from 'next-intl';

import { LANGUAGE_OPTIONS, type LanguageOption } from './ragUploadConstants';

interface LanguageMultiSelectProps {
  selected: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}

function selectedOptions(codes: string[]): LanguageOption[] {
  const out: LanguageOption[] = [];
  for (const code of codes) {
    const opt = LANGUAGE_OPTIONS.find((o) => o.code === code);
    if (opt !== undefined) out.push(opt);
  }
  return out;
}

function isItemEqual(a: LanguageOption, b: LanguageOption): boolean {
  return a.code === b.code;
}

function labelFor(item: LanguageOption): string {
  return item.label;
}

function ChipsList({ items }: { items: LanguageOption[] }): React.JSX.Element {
  return (
    <>
      {items.map((item) => (
        <ComboboxChip key={item.code}>{item.label}</ComboboxChip>
      ))}
    </>
  );
}

export function LanguageMultiSelect({
  selected,
  disabled = false,
  onChange,
}: LanguageMultiSelectProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  const anchor = useComboboxAnchor();
  const value = selectedOptions(selected);

  function handleChange(next: LanguageOption[]): void {
    onChange(next.map((o) => o.code));
  }

  return (
    <Combobox
      multiple
      items={[...LANGUAGE_OPTIONS]}
      value={value}
      onValueChange={handleChange}
      itemToStringLabel={labelFor}
      isItemEqualToValue={isItemEqual}
      disabled={disabled}
    >
      <ComboboxChips ref={anchor}>
        <ChipsList items={value} />
        <ComboboxChipsInput placeholder={value.length === 0 ? t('languagesPlaceholder') : ''} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor} className="max-h-[200px]">
        <ComboboxEmpty>{t('languagesPlaceholder')}</ComboboxEmpty>
        <ComboboxList>
          {(item: LanguageOption) => (
            <ComboboxItem key={item.code} value={item} className="cursor-pointer">
              <span className="flex items-center flex-1 gap-2">
                <span className="font-mono text-muted-foreground text-[10px]">{'(' + item.code + ')'}</span>
                {item.label}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
