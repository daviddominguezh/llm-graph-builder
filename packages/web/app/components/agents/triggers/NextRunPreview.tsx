'use client';

import dayjs, { type Dayjs } from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment, useEffect, useState } from 'react';

import { computePreviewRuns, type PreviewRunItem } from './nextRun';
import type { TriggerFormState } from './types';

dayjs.extend(relativeTime);

const TICK_MS = 30000;
const DATE_FORMAT = 'ddd, MMM D';
const TIME_FORMAT = 'h:mm A';
const FIRST_RUN_COUNT = 3;
const LAST_RUN_COUNT = 2;

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
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
      <Clock className="size-3.5" />
      {count > 1 ? t('previewLabelMany') : t('previewLabel')}
    </span>
  );
}

function RunRowCells({
  index,
  date,
  time,
  hint,
}: {
  index: number;
  date: string;
  time: string;
  hint: string;
}) {
  return (
    <>
      <span className="text-right text-muted-foreground/80">{index}.</span>
      <span>{date}</span>
      <span>·</span>
      <span>{time}</span>
      <span className="ml-1 text-muted-foreground/80">({hint})</span>
    </>
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

function RunFragment({ item, now }: { item: PreviewRunItem; now: Dayjs }) {
  return (
    <RunRowCells
      index={item.index}
      date={item.date.locale('en').format(DATE_FORMAT)}
      time={item.date.locale('en').format(TIME_FORMAT)}
      hint={item.date.locale('en').from(now)}
    />
  );
}

export function NextRunPreview({ state }: NextRunPreviewProps) {
  const t = useTranslations('editor.triggers');
  const now = useNow();
  const nowDay = dayjs(now);
  const { first, last, hasGap } = computePreviewRuns(state, FIRST_RUN_COUNT, LAST_RUN_COUNT, nowDay);
  const total = first.length + last.length;

  if (total === 0) {
    return <MutedLine label={t('previewLabel')} value={t('previewNone')} />;
  }
  return (
    <div className="flex flex-col gap-1.5 text-xs mt-2">
      <HeaderLabel count={total} />
      <div className="ml-[1.375rem] grid w-fit grid-cols-[auto_auto_auto_auto_auto] items-baseline gap-x-1.5 gap-y-1 text-muted-foreground tabular-nums">
        {first.map((item) => (
          <Fragment key={item.date.toISOString()}>
            <RunFragment item={item} now={nowDay} />
          </Fragment>
        ))}
        {hasGap && <span className="col-span-full font-bold">…</span>}
        {last.map((item) => (
          <Fragment key={item.date.toISOString()}>
            <RunFragment item={item} now={nowDay} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
