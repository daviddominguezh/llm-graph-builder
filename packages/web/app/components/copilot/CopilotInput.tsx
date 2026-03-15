'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowUp, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface CopilotInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function CopilotInput({ onSend, onStop, isStreaming }: CopilotInputProps) {
  const t = useTranslations('copilot');
  const [text, setText] = useState('');

  const trimmed = text.trim();

  function handleSend() {
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  function handleButtonClick() {
    if (isStreaming) {
      onStop();
    } else {
      handleSend();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex items-end gap-1 border-t p-2">
      <Textarea
        rows={1}
        className="max-h-[6rem] min-h-0 overflow-y-auto"
        placeholder={t('placeholder')}
        value={text}
        disabled={isStreaming}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <Button
        variant="default"
        className="size-9.5"
        disabled={!trimmed && !isStreaming}
        onClick={handleButtonClick}
        aria-label={isStreaming ? t('stop') : t('send')}
      >
        {isStreaming ? <Loader2 className="size-3 animate-spin" /> : <ArrowUp className="size-3" />}
      </Button>
    </div>
  );
}
