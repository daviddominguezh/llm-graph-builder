import { ArrowUp, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { useT } from '../../app/i18nContext.js';
import { Button } from '../primitives/button.js';

export type ComposerVariant = 'welcome' | 'chat';

export interface ComposerInputProps {
  onSend: (text: string) => void;
  isStreaming?: boolean;
  variant?: ComposerVariant;
}

function usePlaceholder(variant: ComposerVariant): string {
  const t = useT();
  return variant === 'welcome' ? t('howCanIHelp') : t('reply');
}

function useSubmitOnEnter(
  isStreaming: boolean,
  submit: () => void
): (e: React.KeyboardEvent<HTMLTextAreaElement>) => void {
  return (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
      e.preventDefault();
      submit();
    }
  };
}

interface SendButtonRowProps {
  onSend: () => void;
  sendDisabled: boolean;
  isStreaming: boolean;
  sendLabel: string;
}

function SendButtonRow({ onSend, sendDisabled, isStreaming, sendLabel }: SendButtonRowProps) {
  return (
    <div className="flex items-center justify-end">
      <Button
        variant="default"
        size="icon"
        aria-label={sendLabel}
        disabled={sendDisabled}
        onClick={onSend}
        className="rounded-full"
      >
        {isStreaming ? <Loader2 className="animate-spin" /> : <ArrowUp />}
      </Button>
    </div>
  );
}

export function ComposerInput({ onSend, isStreaming = false, variant = 'chat' }: ComposerInputProps) {
  const t = useT();
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const placeholder = usePlaceholder(variant);

  const submit = () => {
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = useSubmitOnEnter(isStreaming, submit);
  const heightClass = variant === 'welcome' ? 'h-[122px]' : '';
  const shadowClass =
    variant === 'welcome'
      ? 'shadow-[0_24px_60px_-20px_rgba(0,0,0,0.12),_0_8px_24px_-8px_rgba(0,0,0,0.06)] dark:shadow-none'
      : '';

  return (
    <div
      className={`rounded-2xl border border-border bg-background dark:bg-input/40 p-4 flex flex-col gap-2 transition-colors focus-within:border-ring/50 dark:focus-within:border-ring/40 ${heightClass} ${shadowClass}`}
    >
      <textarea
        rows={1}
        className="bg-transparent resize-none outline-none text-sm leading-relaxed placeholder:text-muted-foreground w-full flex-1 min-h-0 max-h-48 field-sizing-content"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <SendButtonRow
        onSend={submit}
        sendDisabled={!trimmed || isStreaming}
        isStreaming={isStreaming}
        sendLabel={t('send')}
      />
    </div>
  );
}
