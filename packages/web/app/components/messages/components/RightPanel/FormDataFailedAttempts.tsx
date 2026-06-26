'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import { formatRelativeTime, type FailedAttempt } from '@daviddh/llm-graph-runner';

interface Props {
  attempts: FailedAttempt[];
}

export function FormDataFailedAttempts({ attempts }: Props): ReactElement | null {
  const t = useTranslations('forms');
  if (attempts.length === 0) return null;
  const now = new Date();
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <p className="font-medium">{t('rightPanel.failedAttempts.title')}</p>
      {attempts.map((a, i) => (
        <AttemptLine key={i} attempt={a} now={now} t={t} />
      ))}
    </div>
  );
}

interface AttemptLineProps {
  attempt: FailedAttempt;
  now: Date;
  t: ReturnType<typeof useTranslations>;
}

function AttemptLine({ attempt, now, t }: AttemptLineProps): ReactElement | null {
  const first = attempt.errors[0];
  if (!first) return null;
  const rel = formatRelativeTime(now, new Date(attempt.at));
  const when = relToString(t, rel);
  return (
    <p>
      {t('rightPanel.failedAttempts.item', {
        fieldPath: first.fieldPath,
        reason: first.reason ?? '',
        when,
      })}
    </p>
  );
}

function relToString(t: ReturnType<typeof useTranslations>, rel: string): string {
  if (rel === 'just-now') return t('export.relativeTime.justNow');
  const parts = rel.split(':');
  const bucket = parts[0];
  const num = parseInt(parts[1] ?? '0', 10);
  if (bucket === 'seconds') return t('export.relativeTime.secondsAgo', { n: num });
  if (bucket === 'minutes') return t('export.relativeTime.minutesAgo', { n: num });
  if (bucket === 'hours') return t('export.relativeTime.hoursAgo', { n: num });
  return t('export.relativeTime.daysAgo', { n: num });
}
