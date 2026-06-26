import { useMemo } from "react";
import {
  parseISO,
  startOfDay,
  startOfWeek,
  endOfWeek,
  addDays,
  differenceInDays,
  isBefore,
  isAfter,
} from "date-fns";

import { MonthEventBadge } from "@cc/calendar/components/month-view/month-event-badge";

import type { IEvent } from "@cc/calendar/interfaces";

interface IProps {
  selectedDate: Date;
  multiDayEvents: IEvent[];
  hideEdit: boolean;
}

export function WeekViewMultiDayEventsRow({
  selectedDate,
  multiDayEvents,
  hideEdit,
}: IProps) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday = 1
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const processedEvents = useMemo(() => {
    return multiDayEvents
      .map((event) => {
        const start = parseISO(event.startDate);
        const end = parseISO(event.endDate);
        const adjustedStart = isBefore(start, weekStart) ? weekStart : start;
        const adjustedEnd = isAfter(end, weekEnd) ? weekEnd : end;
        const startIndex = differenceInDays(adjustedStart, weekStart);
        const endIndex = differenceInDays(adjustedEnd, weekStart);

        return {
          ...event,
          adjustedStart,
          adjustedEnd,
          startIndex,
          endIndex,
        };
      })
      .sort((a, b) => {
        const startDiff = a.adjustedStart.getTime() - b.adjustedStart.getTime();
        if (startDiff !== 0) return startDiff;
        return b.endIndex - b.startIndex - (a.endIndex - a.startIndex);
      });
  }, [multiDayEvents, weekStart, weekEnd]);

  const eventRows = useMemo(() => {
    const rows: (typeof processedEvents)[] = [];

    processedEvents.forEach((event) => {
      let rowIndex = rows.findIndex((row) =>
        row.every(
          (e) => e.endIndex < event.startIndex || e.startIndex > event.endIndex
        )
      );

      if (rowIndex === -1) {
        rowIndex = rows.length;
        rows.push([]);
      }

      rows[rowIndex].push(event);
    });

    return rows;
  }, [processedEvents]);

  const hasEventsInWeek = useMemo(() => {
    return multiDayEvents.some((event) => {
      const start = parseISO(event.startDate);
      const end = parseISO(event.endDate);

      return (
        // Event starts within the week
        (start >= weekStart && start <= weekEnd) ||
        // Event ends within the week
        (end >= weekStart && end <= weekEnd) ||
        // Event spans the entire week
        (start <= weekStart && end >= weekEnd)
      );
    });
  }, [multiDayEvents, weekStart, weekEnd]);

  if (!hasEventsInWeek) {
    return null;
  }

  return (
    <div className="twcal:hidden twcal:overflow-hidden twcal:sm:flex">
      <div className="twcal:w-18 twcal:border-b"></div>
      <div className="twcal:grid twcal:flex-1 twcal:grid-cols-7 twcal:divide-x twcal:border-b twcal:border-l">
        {weekDays.map((day, dayIndex) => (
          <div
            key={day.toISOString()}
            className="twcal:flex twcal:h-full twcal:flex-col twcal:gap-1 twcal:py-1"
          >
            {eventRows.map((row, rowIndex) => {
              const event = row.find(
                (e) => e.startIndex <= dayIndex && e.endIndex >= dayIndex
              );

              if (!event) {
                return (
                  <div key={`${rowIndex}-${dayIndex}`} className="twcal:h-6.5" />
                );
              }

              let position: "first" | "middle" | "last" | "none" = "none";

              if (
                dayIndex === event.startIndex &&
                dayIndex === event.endIndex
              ) {
                position = "none";
              } else if (dayIndex === event.startIndex) {
                position = "first";
              } else if (dayIndex === event.endIndex) {
                position = "last";
              } else {
                position = "middle";
              }

              return (
                <MonthEventBadge
                  key={`${event.id}-${dayIndex}`}
                  event={event}
                  cellDate={startOfDay(day)}
                  position={position}
                  hideEdit={hideEdit}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
