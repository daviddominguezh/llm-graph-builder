'use client';

import { useTranslations } from 'next-intl';

import { IntervalInput } from './IntervalInput';
import { TimeSelect } from './TimeSelect';
import { UnitSelect } from './UnitSelect';
import { WeekdayPicker } from './WeekdayPicker';
import type { RecurringConfig, RecurringUnit, Weekday } from './types';

interface RecurringFieldsProps {
  value: RecurringConfig;
  onChange: (next: RecurringConfig) => void;
}

const SENTENCE_BASE = 'flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm leading-relaxed';
const MAX_DAY_OF_MONTH = 31;
const INLINE_TIMED_UNITS: RecurringUnit[] = ['days', 'months'];

function showsInlineTime(unit: RecurringUnit): boolean {
  return INLINE_TIMED_UNITS.includes(unit);
}

function MonthDayFragment({ value, onChange }: RecurringFieldsProps) {
  const t = useTranslations('editor.triggers');
  return (
    <>
      <span className="text-muted-foreground">{t('onDay')}</span>
      <IntervalInput
        value={value.dayOfMonth}
        max={MAX_DAY_OF_MONTH}
        ariaLabel={t('onDay')}
        onChange={(dayOfMonth) => onChange({ ...value, dayOfMonth })}
      />
    </>
  );
}

function TimeFragment({ value, onChange }: RecurringFieldsProps) {
  const t = useTranslations('editor.triggers');
  return (
    <>
      <span className="text-muted-foreground">{t('at')}</span>
      <TimeSelect value={value.time} onChange={(time) => onChange({ ...value, time })} />
    </>
  );
}

function MainSentence({ value, onChange }: RecurringFieldsProps) {
  const t = useTranslations('editor.triggers');
  return (
    <div className={SENTENCE_BASE}>
      <span className="text-muted-foreground">{t('runEvery')}</span>
      <IntervalInput
        value={value.interval}
        ariaLabel={t('runEvery')}
        onChange={(interval) => onChange({ ...value, interval })}
      />
      <UnitSelect
        value={value.unit}
        interval={value.interval}
        onChange={(unit) => onChange({ ...value, unit })}
      />
      {value.unit === 'months' && <MonthDayFragment value={value} onChange={onChange} />}
      {showsInlineTime(value.unit) && <TimeFragment value={value} onChange={onChange} />}
    </div>
  );
}

function WeekdayRow({ value, onChange }: RecurringFieldsProps) {
  const t = useTranslations('editor.triggers');
  const toggle = (d: Weekday) => {
    const next = value.weekdays.includes(d) ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d];
    onChange({ ...value, weekdays: next });
  };
  return (
    <div className={SENTENCE_BASE}>
      <span className="text-muted-foreground">{t('on')}</span>
      <WeekdayPicker selected={value.weekdays} onToggle={toggle} />
      <TimeFragment value={value} onChange={onChange} />
    </div>
  );
}

export function RecurringFields({ value, onChange }: RecurringFieldsProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <MainSentence value={value} onChange={onChange} />
      {value.unit === 'weeks' && <WeekdayRow value={value} onChange={onChange} />}
    </div>
  );
}
