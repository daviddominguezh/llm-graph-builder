'use client';

import { Button } from '@/components/ui/button';
import { ArrowUp, Loader2, OctagonX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useOpenRouterModels } from '../../../hooks/useOpenRouterModels';
import { SimulationModelSelector } from './SimulationModelSelector';
import { SimulationThinkingEffort, type ThinkingEffort } from './SimulationThinkingEffort';

interface SimulationInputProps {
  loading: boolean;
  terminated: boolean;
  terminatedLabel: string;
  terminatedDescription: string;
  onSendMessage: (text: string) => void;
}

function TerminatedBanner({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex w-full flex-col">
      <div className="h-[1px] w-full bg-gray-200" />
      <div className="m-2 flex gap-2 rounded-md bg-gray-100 p-2 text-xs">
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
    <Button disabled={disabled} onClick={onClick} size="icon" className="size-7 rounded-full">
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
      <SimulationModelSelector models={models} value={modelId} onValueChange={onModelChange} />
      <SimulationThinkingEffort value={effort} onValueChange={onEffortChange} />
      <div className="flex-1" />
      <SendButton disabled={sendDisabled} loading={loading} onClick={onSubmit} />
    </div>
  );
}

function ChatInput({ loading, onSendMessage }: Pick<SimulationInputProps, 'loading' | 'onSendMessage'>) {
  const [text, setText] = useState('');
  const [modelId, setModelId] = useState('x-ai/grok-4.1-fast');
  const [effort, setEffort] = useState<ThinkingEffort>('medium');
  const t = useTranslations('simulation');
  const models = useOpenRouterModels();

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSendMessage(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col mx-2 mb-0 overflow-hidden rounded-2xl border bg-muted/30">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('placeholder')}
        disabled={loading}
        rows={2}
        className="w-full resize-none border-b bg-transparent px-3 pt-0 pb-0 text-xs outline-none placeholder:text-muted-foreground disabled:opacity-50"
      />
      <ChatInputControls
        models={models}
        modelId={modelId}
        effort={effort}
        onModelChange={setModelId}
        onEffortChange={setEffort}
        sendDisabled={loading || text.trim().length === 0}
        loading={loading}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export function SimulationInput(props: SimulationInputProps) {
  const { loading, terminated, terminatedLabel, terminatedDescription, onSendMessage } = props;
  if (terminated) return <TerminatedBanner label={terminatedLabel} description={terminatedDescription} />;
  return <ChatInput loading={loading} onSendMessage={onSendMessage} />;
}
