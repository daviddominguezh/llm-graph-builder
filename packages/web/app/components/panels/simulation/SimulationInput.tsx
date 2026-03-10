'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, OctagonX, Send } from 'lucide-react';
import { useState } from 'react';

interface SimulationInputProps {
  loading: boolean;
  terminated: boolean;
  terminatedLabel: string;
  terminatedDescription: string;
  onSendMessage: (text: string) => void;
}

function TerminatedBanner({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex flex-col w-full">
      <div className="w-full h-[1px] bg-gray-200"></div>

      <div className="flex gap-2 p-2 text-xs bg-gray-100 m-2 rounded-md">
        <OctagonX className="size-3.5 mt-0.5" />
        <div className="flex flex-col">
          <span>{label}</span>
          <span className="text-muted-foreground">{description}</span>
        </div>
      </div>
    </div>
  );
}

export function SimulationInput({
  loading,
  terminated,
  terminatedLabel,
  terminatedDescription,
  onSendMessage,
}: SimulationInputProps) {
  const [text, setText] = useState('');

  if (terminated) return <TerminatedBanner label={terminatedLabel} description={terminatedDescription} />;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSendMessage(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
      handleSubmit();
    }
  };

  return (
    <div className="flex items-center gap-1 border-t p-1.5">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={loading}
        className="flex-1"
      />
      <Button disabled={loading || text.trim().length === 0} onClick={handleSubmit}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      </Button>
    </div>
  );
}
