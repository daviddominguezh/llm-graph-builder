'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import dayjs, { type Dayjs } from 'dayjs';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { MiniCalendar } from './MiniCalendar';
import { TimeSelect } from './TimeSelect';

interface DateTimePickerProps {
  value: string;
  onChange: (next: string) => void;
}

const RADIX = 10;
const DEFAULT_TIME = '09:00';
const TRIGGER_DATE_FORMAT = 'MMM D, YYYY';
const ISO_NO_SECONDS = 'YYYY-MM-DDTHH:mm';

function parseValue(value: string): { date: Dayjs | null; time: string } {
  if (!value) return { date: null, time: DEFAULT_TIME };
  const d = dayjs(value);
  if (!d.isValid()) return { date: null, time: DEFAULT_TIME };
  return { date: d, time: d.format('HH:mm') };
}

function combine(date: Dayjs | null, time: string): string {
  if (!date) return '';
  const [hRaw, mRaw] = time.split(':');
  const h = parseInt(hRaw ?? '', RADIX);
  const m = parseInt(mRaw ?? '', RADIX);
  return date
    .hour(Number.isFinite(h) ? h : 0)
    .minute(Number.isFinite(m) ? m : 0)
    .second(0)
    .format(ISO_NO_SECONDS);
}

function PickerBody({
  date,
  time,
  onChange,
}: {
  date: Dayjs | null;
  time: string;
  onChange: (next: string) => void;
}) {
  const t = useTranslations('editor.triggers');
  return (
    <div className="flex flex-col gap-2">
      <MiniCalendar value={date} onChange={(next) => onChange(combine(next, time))} />
      <Separator />
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-xs text-muted-foreground">{t('at')}</span>
        <TimeSelect value={time} onChange={(next) => onChange(combine(date ?? dayjs(), next))} />
      </div>
    </div>
  );
}

export function DateTimePicker({ value, onChange }: DateTimePickerProps) {
  const t = useTranslations('editor.triggers');
  const { date, time } = parseValue(value);
  const label = date ? `${date.locale('en').format(TRIGGER_DATE_FORMAT)} · ${time}` : t('pickDateTime');
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-sm font-medium">
            <CalendarIcon className="size-3.5 text-muted-foreground" />
            <span className={date ? 'text-foreground tabular-nums' : 'text-muted-foreground'}>{label}</span>
          </Button>
        }
      />
      <PopoverContent align="start" className="w-fit p-3">
        <PickerBody date={date} time={time} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}
