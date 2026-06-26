import { useMemo } from "react";
import { useLocalizedWeekDays } from "@cc/lib/date-utils";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

import { DayCell } from "@cc/calendar/components/month-view/day-cell";

import {
  getCalendarCells,
  calculateMonthEventPositions,
} from "@cc/calendar/helpers";

import type { IEvent } from "@cc/calendar/interfaces";

interface IProps {
  singleDayEvents: IEvent[];
  multiDayEvents: IEvent[];
  hideEdit: boolean;
}


export function CalendarMonthView({
  singleDayEvents,
  multiDayEvents,
  hideEdit,
}: IProps) {
  const { selectedDate } = useCalendar();
  
  const WEEK_DAYS = useLocalizedWeekDays();

  const allEvents = [...multiDayEvents, ...singleDayEvents];

  const cells = useMemo(() => getCalendarCells(selectedDate), [selectedDate]);

  const eventPositions = useMemo(
    () =>
      calculateMonthEventPositions(
        multiDayEvents,
        singleDayEvents,
        selectedDate
      ),
    [multiDayEvents, singleDayEvents, selectedDate]
  );

  return (
    <div className="fullgrowHeight twcal:overflow-scroll">
      <div className="twcal:grid twcal:grid-cols-7">
        {WEEK_DAYS.map((day, index) => (
          <div key={day} className={`twcal:flex twcal:items-center twcal:justify-center twcal:py-2 twcal:border-t ${index === 0 ? '' : 'twcal:border-l'}`}>
            <span className="twcal:text-xs twcal:font-medium twcal:text-muted-foreground">
              {day}
            </span>
          </div>
        ))}
      </div>

      <div className="twcal:grid twcal:grid-cols-7 twcal:overflow-hidden">
        {cells.map((cell) => (
          <DayCell
            key={cell.date.toISOString()}
            cell={cell}
            events={allEvents}
            eventPositions={eventPositions}
            hideEdit={hideEdit}
          />
        ))}
      </div>
    </div>
  );
}
