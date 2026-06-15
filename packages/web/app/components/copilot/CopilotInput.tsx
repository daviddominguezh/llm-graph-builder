'use client';

import { Button } from '@/components/ui/button';
import { ArrowUp, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

export interface CopilotInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

function useCopilotEditor(onSend: (text: string) => void) {
  const [text, setText] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);

  const clearEditor = useCallback(() => {
    if (editorRef.current) editorRef.current.textContent = '';
    setText('');
  }, []);

  const handleInput = useCallback(() => {
    const content = editorRef.current?.textContent ?? '';
    setText(content);
    if (content === '' && editorRef.current) editorRef.current.innerHTML = '';
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSend(trimmed);
    clearEditor();
  }, [text, onSend, clearEditor]);

  return { editorRef, handleInput, handleSend, isEmpty: text.trim().length === 0 };
}

interface EditorAreaProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  placeholder: string;
  disabled: boolean;
  onInput: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

function EditorArea({ editorRef, placeholder, disabled, onInput, onKeyDown }: EditorAreaProps) {
  return (
    <div
      data-native-scroll
      className="max-h-96 min-h-6 w-full overflow-y-auto break-words px-3 py-2 text-xs transition-opacity"
    >
      <div
        ref={editorRef}
        contentEditable={!disabled}
        role="textbox"
        aria-label={placeholder}
        aria-multiline="true"
        tabIndex={0}
        onInput={onInput}
        onKeyDown={onKeyDown}
        data-placeholder={placeholder}
        className="min-h-4 outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}

interface SendButtonProps {
  isStreaming: boolean;
  disabled: boolean;
  onClick: () => void;
  sendLabel: string;
  stopLabel: string;
}

function SendButton({ isStreaming, disabled, onClick, sendLabel, stopLabel }: SendButtonProps) {
  return (
    <Button
      size="icon"
      className="size-7"
      disabled={disabled}
      onClick={onClick}
      aria-label={isStreaming ? stopLabel : sendLabel}
    >
      {isStreaming ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
    </Button>
  );
}

export function CopilotInput({ onSend, onStop, isStreaming }: CopilotInputProps) {
  const t = useTranslations('copilot');
  const { editorRef, handleInput, handleSend, isEmpty } = useCopilotEditor(onSend);

  const handleButtonClick = () => {
    if (isStreaming) onStop();
    else handleSend();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="mx-2 my-2 flex flex-col gap-1 overflow-hidden rounded-lg border border-transparent bg-background py-1 transition-colors focus-within:border-ring focus-within:ring-ring/30 focus-within:ring-[2px]">
      <EditorArea
        editorRef={editorRef}
        placeholder={t('placeholder')}
        disabled={isStreaming}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
      />
      <div className="flex items-center gap-2 px-2 pb-1">
        <div className="flex-1" />
        <SendButton
          isStreaming={isStreaming}
          disabled={!isStreaming && isEmpty}
          onClick={handleButtonClick}
          sendLabel={t('send')}
          stopLabel={t('stop')}
        />
      </div>
    </div>
  );
}
