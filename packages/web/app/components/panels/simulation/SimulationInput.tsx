'use client';

import { Button } from '@/components/ui/button';
import { ArrowUp, Loader2, OctagonX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

import { useOpenRouterModels } from '../../../hooks/useOpenRouterModels';
import { SimulationModelSelector } from './SimulationModelSelector';
import type { ThinkingEffort } from './SimulationThinkingEffort';

interface SimulationInputProps {
  loading: boolean;
  terminated: boolean;
  terminatedLabel: string;
  terminatedDescription: string;
  modelId: string;
  onModelIdChange: (id: string) => void;
  onSendMessage: (text: string) => void;
}

function TerminatedBanner({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex w-full flex-col">
      <div className="h-[1px] w-full bg-border mt-1" />
      <div className="m-2 flex gap-2 rounded-md bg-muted p-2 text-xs">
        <OctagonX className="mt-0.5 size-3.5" />
        <div className="flex flex-col">
          <span>{label}</span>
          <span className="text-muted-foreground">{description}</span>
        </div>
      </div>
    </div>
  );
}

function SendButton({ disabled, loading, onClick }: { disabled: boolean; loading: boolean; onClick: () => void }) {
  return (
    <Button disabled={disabled} onClick={onClick} size="icon" className="size-7">
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
    </Button>
  );
}

function ChatInputControls({
  models,
  modelId,
  effort,
  onModelChange,
  onEffortChange,
  sendDisabled,
  loading,
  onSubmit,
}: {
  models: ReturnType<typeof useOpenRouterModels>;
  modelId: string;
  effort: ThinkingEffort;
  onModelChange: (v: string) => void;
  onEffortChange: (v: ThinkingEffort) => void;
  sendDisabled: boolean;
  loading: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 pb-0">
      <div className="flex-1" />
      <SimulationModelSelector
        models={models}
        value={modelId}
        onValueChange={onModelChange}
        effort={effort}
        onEffortChange={onEffortChange}
      />
      <SendButton disabled={sendDisabled} loading={loading} onClick={onSubmit} />
    </div>
  );
}

function ChatInput({
  loading,
  modelId,
  onModelIdChange,
  onSendMessage,
}: Pick<SimulationInputProps, 'loading' | 'modelId' | 'onModelIdChange' | 'onSendMessage'>) {
  const [text, setText] = useState('');
  const [effort, setEffort] = useState<ThinkingEffort>('high');
  const t = useTranslations('simulation');
  const models = useOpenRouterModels();

  const editorRef = useRef<HTMLDivElement>(null);

  const clearEditor = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.textContent = '';
    }
    setText('');
  }, []);

  const handleInput = useCallback(() => {
    const content = editorRef.current?.textContent ?? '';
    setText(content);
    if (content === '' && editorRef.current) {
      editorRef.current.innerHTML = '';
    }
  }, []);

  const handleEditorSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSendMessage(trimmed);
    clearEditor();
  }, [text, onSendMessage, clearEditor]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
      e.preventDefault();
      handleEditorSubmit();
    }
  };

  const isEmpty = text.trim().length === 0;

  return (
    <div className="mx-2 flex flex-col overflow-hidden rounded-lg border bg-muted/30 py-1 gap-1 my-2">
      <div className="max-h-96 min-h-6 w-full overflow-y-auto break-words px-3 py-2 text-xs transition-opacity">
        <div
          ref={editorRef}
          contentEditable={!loading}
          role="textbox"
          aria-label={t('placeholder')}
          aria-multiline="true"
          tabIndex={0}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          data-placeholder={t('placeholder')}
          className="min-h-4 outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
        />
      </div>
      <ChatInputControls
        models={models}
        modelId={modelId}
        effort={effort}
        onModelChange={onModelIdChange}
        onEffortChange={setEffort}
        sendDisabled={loading || isEmpty}
        loading={loading}
        onSubmit={handleEditorSubmit}
      />
    </div>
  );
}

export function SimulationInput(props: SimulationInputProps) {
  const { loading, terminated, terminatedLabel, terminatedDescription } = props;
  const { modelId, onModelIdChange, onSendMessage } = props;
  if (terminated) return <TerminatedBanner label={terminatedLabel} description={terminatedDescription} />;
  return <ChatInput loading={loading} modelId={modelId} onModelIdChange={onModelIdChange} onSendMessage={onSendMessage} />;
}
