'use client';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { computeNextRuns } from './nextRun';
import type { TriggerFormState } from './types';

dayjs.extend(relativeTime);

const TICK_MS = 30000;
const NEXT_FORMAT = 'ddd, MMM D [·] h:mm A';
const RUN_COUNT = 3;

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

function HeaderLabel({ count }: { count: number }) {
  const t = useTranslations('editor.triggers');
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <Clock className="size-3.5" />
      {count > 1 ? t('previewLabelMany') : t('previewLabel')}
    </span>
  );
}

function RunRow({ value, hint }: { value: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="font-medium text-foreground tabular-nums">{value}</span>
      <span className="text-muted-foreground/80">({hint})</span>
    </div>
  );
}

function MutedLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Clock className="size-3.5" />
        {label}
      </span>
      <span className="italic text-muted-foreground">{value}</span>
    </div>
  );
}

export function NextRunPreview({ state }: NextRunPreviewProps) {
  const t = useTranslations('editor.triggers');
  const now = useNow();
  const nowDay = dayjs(now);
  const runs = computeNextRuns(state, RUN_COUNT, nowDay);

  if (runs.length === 0) {
    return <MutedLine label={t('previewLabel')} value={t('previewNone')} />;
  }
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <HeaderLabel count={runs.length} />
      <div className="ml-[1.375rem] flex flex-col gap-1">
        {runs.map((run) => (
          <RunRow
            key={run.toISOString()}
            value={run.locale('en').format(NEXT_FORMAT)}
            hint={run.locale('en').from(nowDay)}
          />
        ))}
      </div>
    </div>
  );
}
