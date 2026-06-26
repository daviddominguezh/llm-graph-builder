'use client';

import { useTranslations } from 'next-intl';

import { EndAtField } from './EndAtField';
import { IntervalInput } from './IntervalInput';
import { StartAtField } from './StartAtField';
import { TimeSelect } from './TimeSelect';
import { UnitSelect } from './UnitSelect';
import { WeekdayPicker } from './WeekdayPicker';
import type { RecurringConfig, RecurringUnit, Weekday } from './types';

interface RecurringFieldsProps {
  value: RecurringConfig;
  onChange: (next: RecurringConfig) => void;
}

const ROW_CONTENT =
  'col-span-2 flex min-h-7 max-h-7 flex-wrap items-center gap-x-1.5 gap-y-2 text-sm leading-relaxed';
const ROW_LABEL = 'self-center text-xs font-medium leading-tight text-muted-foreground';
const MAX_DAY_OF_MONTH = 31;
const INLINE_TIMED_UNITS: RecurringUnit[] = ['days', 'months'];

function showsInlineTime(unit: RecurringUnit): boolean {
  return INLINE_TIMED_UNITS.includes(unit);
}

function MonthDayFragment({ value, onChange }: RecurringFieldsProps) {
  const t = useTranslations('editor.triggers');
  return (
    <>
      <span className="text-xs font-medium text-muted-foreground">{t('onDay')}</span>
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
      <span className="text-xs font-medium text-muted-foreground">{t('at')}</span>
      <TimeSelect value={value.time} onChange={(time) => onChange({ ...value, time })} />
    </>
  );
}

function MainSentenceRow({ value, onChange }: RecurringFieldsProps) {
  const t = useTranslations('editor.triggers');
  return (
    <>
      <span className={ROW_LABEL}>{t('runEvery')}</span>
      <div className={ROW_CONTENT}>
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
    </>
  );
}

function WeekdayRow({ value, onChange }: RecurringFieldsProps) {
  const t = useTranslations('editor.triggers');
  const toggle = (d: Weekday) => {
    const next = value.weekdays.includes(d) ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d];
    onChange({ ...value, weekdays: next });
  };
  return (
    <>
      <span className={ROW_LABEL}>{t('on')}</span>
      <div className={ROW_CONTENT}>
        <WeekdayPicker selected={value.weekdays} onToggle={toggle} />
        <TimeFragment value={value} onChange={onChange} />
      </div>
    </>
  );
}

export function RecurringFields({ value, onChange }: RecurringFieldsProps) {
  return (
    <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-2.5">
      <MainSentenceRow value={value} onChange={onChange} />
      {value.unit === 'weeks' && <WeekdayRow value={value} onChange={onChange} />}
      <StartAtField value={value.startAt} onChange={(startAt) => onChange({ ...value, startAt })} />
      <EndAtField value={value.endAt} onChange={(endAt) => onChange({ ...value, endAt })} />
    </div>
  );
}
