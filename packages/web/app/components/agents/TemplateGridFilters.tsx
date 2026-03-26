'use client';

import type { TemplateCategory } from '@daviddh/graph-types';
import { TEMPLATE_CATEGORIES } from '@daviddh/graph-types';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';

/* ------------------------------------------------------------------ */
/*  PillButton                                                         */
/* ------------------------------------------------------------------ */

function PillButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  const base = 'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium cursor-pointer transition-colors';
  const variant = active
    ? 'bg-primary text-primary-foreground'
    : 'bg-muted text-muted-foreground hover:bg-muted/80';

  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`${base} ${variant}`}>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  CategoryPills                                                      */
/* ------------------------------------------------------------------ */

interface CategoryPillsProps {
  value: TemplateCategory | '';
  onChange: (v: TemplateCategory | '') => void;
}

export function CategoryPills({ value, onChange }: CategoryPillsProps) {
  const t = useTranslations('marketplace');
  const tc = useTranslations('categories');

  return (
    <div
      className="flex min-w-0 gap-1 overflow-x-auto shrink-0"
      style={{
        maskImage: 'linear-gradient(to right, black 0, black calc(100% - 24px), transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to right, black 0, black calc(100% - 24px), transparent 100%)',
        scrollbarWidth: 'none',
      }}
    >
      <PillButton active={value === ''} onClick={() => onChange('')} label={t('allCategories')} />
      {TEMPLATE_CATEGORIES.map((cat) => (
        <PillButton key={cat} active={value === cat} onClick={() => onChange(cat)} label={tc(cat)} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SearchBar                                                          */
/* ------------------------------------------------------------------ */

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const t = useTranslations('marketplace');

  return (
    <div className="relative">
      <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('searchPlaceholder')}
        className="h-8 pl-8"
      />
    </div>
  );
}
