import { useMemo } from "react";

import { isSameDay, parseISO, getDaysInMonth, startOfMonth } from "date-fns";
import { useDateFormatting, useLocalizedWeekDays } from "@cc/lib/date-utils";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

import { YearViewDayCell } from "@cc/calendar/components/year-view/year-view-day-cell";

import type { IEvent } from "@cc/calendar/interfaces";

interface IProps {
  month: Date;
  events: IEvent[];
}

export function YearViewMonth({ month, events }: IProps) {
  
  const { setSelectedDate } = useCalendar();
  const { formatDate } = useDateFormatting();

  const monthName = formatDate(month, "MMMM", true);

  const daysInMonth = useMemo(() => {
    const totalDays = getDaysInMonth(month);
    const firstDay = startOfMonth(month).getDay();
    // Convert Sunday (0) to Monday (1) based indexing
    const mondayBasedFirstDay = firstDay === 0 ? 6 : firstDay - 1;

    const days = Array.from({ length: totalDays }, (_, i) => i + 1);
    const blanks = Array(mondayBasedFirstDay).fill(null);

    return [...blanks, ...days];
  }, [month]);

  const weekDays = useLocalizedWeekDays();

  const handleClick = () => {
    setSelectedDate(new Date(month.getFullYear(), month.getMonth(), 1));
  };

  return (
    <div className="twcal:flex twcal:flex-col">
      <button
        type="button"
        onClick={handleClick}
        className="twcal:w-full twcal:rounded-t-lg twcal:border twcal:px-3 twcal:py-2 twcal:text-sm twcal:font-semibold twcal:hover:bg-accent twcal:focus-visible:outline-none twcal:focus-visible:ring-1 twcal:focus-visible:ring-ring"
      >
        {monthName}
      </button>

      <div className="twcal:flex-1 twcal:space-y-2 twcal:rounded-b-lg twcal:border twcal:border-t-0 twcal:p-3">
        <div className="twcal:grid twcal:grid-cols-7 twcal:gap-x-0.5 twcal:text-center">
          {weekDays.map((day, index) => (
            <div key={index} className="twcal:text-xs twcal:font-medium twcal:text-muted-foreground">
              {day}
            </div>
          ))}
        </div>

        <div className="twcal:grid twcal:grid-cols-7 twcal:gap-x-0.5 twcal:gap-y-2">
          {daysInMonth.map((day, index) => {
            if (day === null) return <div key={`blank-${index}`} className="twcal:h-10" />;

            const date = new Date(month.getFullYear(), month.getMonth(), day);
            const dayEvents = events.filter(event => isSameDay(parseISO(event.startDate), date) || isSameDay(parseISO(event.endDate), date));

            return <YearViewDayCell key={`day-${day}`} day={day} date={date} events={dayEvents} />;
          })}
        </div>
      </div>
    </div>
  );
}
