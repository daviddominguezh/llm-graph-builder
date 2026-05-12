'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { LANGUAGE_OPTIONS, type LanguageOption } from './ragUploadConstants';

interface LanguageMultiSelectProps {
  selected: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}

function labelFor(code: string): string {
  const match = LANGUAGE_OPTIONS.find((o) => o.code === code);
  return match === undefined ? code : `${match.label} (${match.code})`;
}

function remaining(selected: string[]): LanguageOption[] {
  return LANGUAGE_OPTIONS.filter((o) => !selected.includes(o.code));
}

export function LanguageMultiSelect({
  selected,
  disabled = false,
  onChange,
}: LanguageMultiSelectProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  const options = remaining(selected);
  const allChosen = options.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {selected.map((code) => (
        <span
          key={code}
          className="inline-flex items-center gap-1 rounded-sm border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]"
        >
          {labelFor(code)}
          <button
            type="button"
            aria-label={t('remove')}
            disabled={disabled}
            onClick={() => onChange(selected.filter((c) => c !== code))}
            className="cursor-pointer text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      {!allChosen && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="xs"
                type="button"
                disabled={disabled}
                className="rounded-sm gap-1"
              />
            }
          >
            <Plus className="size-3" />
            {t('languagesPlaceholder')}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[10rem]">
            {options.map((opt) => (
              <DropdownMenuItem
                key={opt.code}
                onClick={() => onChange([...selected, opt.code])}
                className="font-mono text-[11px]"
              >
                <span className="flex-1">{opt.label}</span>
                <span className="text-muted-foreground">{opt.code}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
