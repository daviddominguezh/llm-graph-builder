'use client';

import '@/app/styles/starry-night.css';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Braces, LayoutList } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { MarkdownHooks } from 'react-markdown';
import rehypeStarryNight from 'rehype-starry-night';
import remarkGfm from 'remark-gfm';

const DEBOUNCE_MS = 500;

interface SystemPromptFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/* ------------------------------------------------------------------ */
/*  View tabs (same styling as ResponseSection ViewTabs)               */
/* ------------------------------------------------------------------ */

const activeTab = 'bg-popover dark:bg-input text-foreground shadow-sm';
const inactiveTab = 'text-muted-foreground hover:text-foreground border-transparent hover:bg-input dark:hover:bg-card';
const tabBase =
  'cursor-pointer inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors border border-transparent';

function ViewTabs({ showRendered, onChange }: { showRendered: boolean; onChange: (rendered: boolean) => void }) {
  const t = useTranslations('agentEditor');
  return (
    <div className="inline-flex gap-1 dark:gap-0.5 rounded-sm bg-input dark:bg-input/40 dark:bg-muted/50 p-0.5">
      <button type="button" onClick={() => onChange(false)} className={`${tabBase} ${showRendered ? inactiveTab : activeTab}`}>
        <Braces className="size-3" />
        {t('viewRaw')}
      </button>
      <button type="button" onClick={() => onChange(true)} className={`${tabBase} ${showRendered ? activeTab : inactiveTab}`}>
        <LayoutList className="size-3" />
        {t('viewRendered')}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rendered markdown view                                             */
/* ------------------------------------------------------------------ */

function RenderedView({ text }: { text: string }) {
  const t = useTranslations('agentEditor');

  if (text.trim() === '') {
    return <p className="p-3 text-xs text-muted-foreground italic">{t('emptyPromptPreview')}</p>;
  }

  return (
    <div className="markdown-content overflow-y-auto p-3 text-xs leading-relaxed">
      <MarkdownHooks remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeStarryNight]}>
        {text}
      </MarkdownHooks>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function SystemPromptField({ value, onChange }: SystemPromptFieldProps) {
  const t = useTranslations('agentEditor');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRendered, setShowRendered] = useState(false);
  const [liveText, setLiveText] = useState(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      setLiveText(text);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onChange(text), DEBOUNCE_MS);
    },
    [onChange]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between mb-[calc(var(--spacing)+1px)]">
        <Label htmlFor="system-prompt" className="text-xs font-medium">{t('systemPrompt')}</Label>
        <ViewTabs showRendered={showRendered} onChange={setShowRendered} />
      </div>
      {showRendered ? (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-background">
          <RenderedView text={liveText} />
        </div>
      ) : (
        <Textarea
          id="system-prompt"
          defaultValue={value}
          onChange={handleChange}
          placeholder={t('systemPromptPlaceholder')}
          className="min-h-0 flex-1 resize-none text-sm bg-background"
        />
      )}
    </div>
  );
}
