import { type FormEvent, useState } from 'react';

import { useT } from '../../app/i18nContext.js';
import { Button } from '../primitives/button.js';

export interface NamePromptProps {
  onSubmit: (name: string) => void;
}

export function NamePrompt({ onSubmit }: NamePromptProps) {
  const t = useT();
  const [name, setName] = useState('');
  const trimmed = name.trim();

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  }

  return (
    <div className="w-full h-dvh flex items-center justify-center bg-card dark:bg-background px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-5">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t('namePromptTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('namePromptSubtitle')}</p>
        </div>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePromptPlaceholder')}
          className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm outline-none transition-colors focus:border-ring/50 dark:focus:border-ring/40"
        />
        <Button type="submit" disabled={trimmed.length === 0}>
          {t('namePromptSubmit')}
        </Button>
      </form>
    </div>
  );
}
