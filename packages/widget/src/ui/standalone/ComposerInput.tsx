import { ArrowUp, Loader2, Plus } from 'lucide-react';
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

interface ComposerActionsProps {
  onAdd?: () => void;
  onSend: () => void;
  sendDisabled: boolean;
  isStreaming: boolean;
  sendLabel: string;
  addLabel: string;
}

function ComposerActions({
  onAdd,
  onSend,
  sendDisabled,
  isStreaming,
  sendLabel,
  addLabel,
}: ComposerActionsProps) {
  return (
    <div className="flex items-center justify-between">
      <Button variant="ghost" size="icon" aria-label={addLabel} onClick={onAdd}>
        <Plus />
      </Button>
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

  return (
    <div className="rounded-2xl border border-border bg-muted/50 p-3 flex flex-col gap-2">
      <textarea
        rows={1}
        className="bg-transparent resize-none outline-none text-sm leading-relaxed placeholder:text-muted-foreground w-full min-h-8 max-h-48 field-sizing-content"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <ComposerActions
        onSend={submit}
        sendDisabled={!trimmed || isStreaming}
        isStreaming={isStreaming}
        sendLabel={t('send')}
        addLabel={t('newChat')}
      />
    </div>
  );
}
