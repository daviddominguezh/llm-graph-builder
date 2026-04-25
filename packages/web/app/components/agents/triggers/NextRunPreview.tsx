'use client';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { computeNextRun } from './nextRun';
import type { TriggerFormState } from './types';

dayjs.extend(relativeTime);

const TICK_MS = 30000;
const NEXT_FORMAT = 'ddd, MMM D [·] h:mm A';

interface NextRunPreviewProps {
  state: TriggerFormState;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

function PreviewLine({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Clock className="size-3.5" />
        {label}
      </span>
      <span className={muted ? 'italic text-muted-foreground' : 'font-medium text-foreground tabular-nums'}>
        {value}
      </span>
      {hint && <span className="text-muted-foreground/80">({hint})</span>}
    </div>
  );
}

export function NextRunPreview({ state }: NextRunPreviewProps) {
  const t = useTranslations('editor.triggers');
  const now = useNow();
  const nowDay = dayjs(now);
  const next = computeNextRun(state, nowDay);

  if (!next) {
    return <PreviewLine label={t('previewLabel')} value={t('previewNone')} muted />;
  }
  return (
    <PreviewLine
      label={t('previewLabel')}
      value={next.locale('en').format(NEXT_FORMAT)}
      hint={next.locale('en').from(nowDay)}
    />
  );
}
