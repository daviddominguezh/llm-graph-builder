'use client';

import { useState } from 'react';
import { Send, Loader2, OctagonX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SimulationInputProps {
  loading: boolean;
  terminated: boolean;
  terminatedLabel: string;
  onSendMessage: (text: string) => void;
}

function TerminatedBanner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 border-t px-3 py-3 text-sm text-muted-foreground">
      <OctagonX className="size-4" />
      <span>{label}</span>
    </div>
  );
}

export function SimulationInput({ loading, terminated, terminatedLabel, onSendMessage }: SimulationInputProps) {
  const [text, setText] = useState('');

  if (terminated) return <TerminatedBanner label={terminatedLabel} />;

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
    <div className="flex items-center gap-2 border-t p-3">
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
