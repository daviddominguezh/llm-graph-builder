'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

const TICK_INTERVAL_MS = 30_000;
const JUST_NOW_THRESHOLD_MS = 60_000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

interface CatalogFreshnessIndicatorProps {
  fetchedAt: number;
}

type RelativeTime =
  | { key: 'updatedJustNow' }
  | { key: 'updatedMinutesAgo'; minutes: number }
  | { key: 'updatedHoursAgo'; hours: number };

function relativeKey(ageMs: number): RelativeTime {
  if (ageMs < JUST_NOW_THRESHOLD_MS) return { key: 'updatedJustNow' };
  if (ageMs < MS_PER_HOUR) return { key: 'updatedMinutesAgo', minutes: Math.floor(ageMs / MS_PER_MINUTE) };
  return { key: 'updatedHoursAgo', hours: Math.floor(ageMs / MS_PER_HOUR) };
}

function freshnessLabel(t: (key: string, values?: Record<string, number>) => string, rel: RelativeTime): string {
  if (rel.key === 'updatedJustNow') return t('updatedJustNow');
  if (rel.key === 'updatedMinutesAgo') return t('updatedMinutesAgo', { minutes: rel.minutes });
  return t('updatedHoursAgo', { hours: rel.hours });
}

export function CatalogFreshnessIndicator({ fetchedAt }: CatalogFreshnessIndicatorProps): React.JSX.Element {
  const t = useTranslations('agentTools');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const ageMs = Math.max(0, now - fetchedAt);
  const rel = relativeKey(ageMs);
  const label = freshnessLabel(t, rel);

  return <span className="text-[10px] text-muted-foreground shrink-0">{label}</span>;
}
