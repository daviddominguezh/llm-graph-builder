import { useMemo } from "react";
import { isToday, startOfDay } from "date-fns";

import { EventBullet } from "@cc/calendar/components/month-view/event-bullet";
import { DroppableDayCell } from "@cc/calendar/components/dnd/droppable-day-cell";
import { MonthEventBadge } from "@cc/calendar/components/month-view/month-event-badge";

import { cn } from "@cc/lib/utils";
import { getMonthCellEvents } from "@cc/calendar/helpers";

import type { ICalendarCell, IEvent } from "@cc/calendar/interfaces";

interface IProps {
  cell: ICalendarCell;
  events: IEvent[];
  eventPositions: Record<string, number>;
  hideEdit: boolean;
}

const MAX_VISIBLE_EVENTS = 3;

export function DayCell({ cell, events, eventPositions, hideEdit }: IProps) {
  const { day, currentMonth, date } = cell;

  const cellEvents = useMemo(
    () => getMonthCellEvents(date, events, eventPositions),
    [date, events, eventPositions]
  );
  const isMonday = date.getDay() === 1;

  return (
    <DroppableDayCell cell={cell}>
      <div
        className={cn(
          "twcal:flex twcal:h-full twcal:flex-col twcal:gap-1 twcal:border-l twcal:border-t twcal:py-1.5 twcal:lg:py-2",
          isMonday && "twcal:border-l-0"
        )}
      >
        <span
          className={cn(
            "twcal:h-6 twcal:px-1 twcal:text-xs twcal:font-semibold twcal:lg:px-2",
            !currentMonth && "twcal:opacity-20",
            isToday(date) &&
              "twcal:flex twcal:w-6 twcal:translate-x-1 twcal:items-center twcal:justify-center twcal:rounded-full twcal:bg-primary twcal:px-0 twcal:font-bold twcal:text-primary-foreground"
          )}
        >
          {day}
        </span>

        <div
          className={cn(
            "twcal:flex twcal:h-6 twcal:gap-1 twcal:px-2 twcal:lg:h-[94px] twcal:lg:flex-col twcal:lg:gap-2 twcal:lg:px-0",
            !currentMonth && "twcal:opacity-50"
          )}
        >
          {[0, 1, 2].map((position) => {
            const event = cellEvents.find((e) => e.position === position);
            const eventKey = event
              ? `event-${event.id}-${position}`
              : `empty-${position}`;

            return (
              <div key={eventKey} className="twcal:lg:flex-1">
                {event && (
                  <>
                    <EventBullet className="twcal:lg:hidden twcal:cursor-pointer" color={event.color} />
                    <MonthEventBadge
                      className="twcal:hidden twcal:lg:flex twcal:cursor-pointer"
                      event={event}
                      cellDate={startOfDay(date)}
                      hideEdit={hideEdit}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {cellEvents.length > MAX_VISIBLE_EVENTS && (
          <p
            className={cn(
              "twcal:h-4.5 twcal:px-1.5 twcal:text-xs twcal:font-semibold twcal:text-muted-foreground",
              !currentMonth && "twcal:opacity-50"
            )}
          >
            <span className="twcal:sm:hidden">
              +{cellEvents.length - MAX_VISIBLE_EVENTS}
            </span>
            <span className="twcal:hidden twcal:sm:inline">
              {" "}
              {cellEvents.length - MAX_VISIBLE_EVENTS} more...
            </span>
          </p>
        )}
      </div>
    </DroppableDayCell>
  );
}
