import { Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';

import { useT } from '../app/i18nContext.js';
import { Button } from './primitives/button.js';

const COPIED_FEEDBACK_MS = 1500;

// Mirrors the dashboard's assistant-message action row:
// Copy (size 12, text-primary while copied) / ThumbsUp (size 12, text-primary
// fill-primary while active) / ThumbsDown (size 12, text-destructive
// fill-destructive while active). Feedback is local state only, matching the
// dashboard's current behavior (no backend integration yet).
export function MessageActions({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  function handleCopy(): void {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }

  return (
    <div className="flex items-center gap-0.5 mt-0.5 mb-2">
      <Button variant="ghost" size="icon" onClick={handleCopy} className="text-muted-foreground" title={t('copy')}>
        <Copy size={12} className={copied ? 'text-primary' : ''} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setFeedback((prev) => (prev === 'up' ? null : 'up'))}
        className="text-muted-foreground"
        title={t('goodResponse')}
      >
        <ThumbsUp size={12} className={feedback === 'up' ? 'text-primary fill-primary' : ''} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setFeedback((prev) => (prev === 'down' ? null : 'down'))}
        className="text-muted-foreground"
        title={t('badResponse')}
      >
        <ThumbsDown size={12} className={feedback === 'down' ? 'text-destructive fill-destructive' : ''} />
      </Button>
    </div>
  );
}
