import {
  parseISO,
  isWithinInterval,
  differenceInDays,
  startOfDay,
  endOfDay,
} from "date-fns";

import { MonthEventBadge } from "@cc/calendar/components/month-view/month-event-badge";

import type { IEvent } from "@cc/calendar/interfaces";

interface IProps {
  selectedDate: Date;
  multiDayEvents: IEvent[];
  hideEdit: boolean;
}

export function DayViewMultiDayEventsRow({
  selectedDate,
  multiDayEvents,
  hideEdit,
}: IProps) {
  const dayStart = startOfDay(selectedDate);
  const dayEnd = endOfDay(selectedDate);

  const multiDayEventsInDay = multiDayEvents
    .filter((event) => {
      const eventStart = parseISO(event.startDate);
      const eventEnd = parseISO(event.endDate);

      const isOverlapping =
        isWithinInterval(dayStart, { start: eventStart, end: eventEnd }) ||
        isWithinInterval(dayEnd, { start: eventStart, end: eventEnd }) ||
        (eventStart <= dayStart && eventEnd >= dayEnd);

      return isOverlapping;
    })
    .sort((a, b) => {
      const durationA = differenceInDays(
        parseISO(a.endDate),
        parseISO(a.startDate)
      );
      const durationB = differenceInDays(
        parseISO(b.endDate),
        parseISO(b.startDate)
      );
      return durationB - durationA;
    });

  if (multiDayEventsInDay.length === 0) return null;

  return (
    <div className="twcal:flex twcal:border-b">
      <div className="twcal:w-18"></div>
      <div className="twcal:flex twcal:flex-1 twcal:flex-col twcal:gap-1 twcal:border-l twcal:py-1">
        {multiDayEventsInDay.map((event) => {
          const eventStart = startOfDay(parseISO(event.startDate));
          const eventEnd = startOfDay(parseISO(event.endDate));
          const currentDate = startOfDay(selectedDate);

          const eventTotalDays = differenceInDays(eventEnd, eventStart) + 1;
          const eventCurrentDay = differenceInDays(currentDate, eventStart) + 1;

          return (
            <MonthEventBadge
              key={event.id}
              event={event}
              cellDate={selectedDate}
              eventCurrentDay={eventCurrentDay}
              eventTotalDays={eventTotalDays}
              hideEdit={hideEdit}
            />
          );
        })}
      </div>
    </div>
  );
}
