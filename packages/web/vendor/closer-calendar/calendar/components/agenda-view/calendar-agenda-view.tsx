import { useMemo } from "react";
import { CalendarX2 } from "lucide-react";
import { parseISO, format, endOfDay, startOfDay, isSameMonth } from "date-fns";
import { useTranslation } from "react-i18next";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

import { ScrollArea } from "@cc/components/ui/scroll-area";
import { AgendaDayGroup } from "@cc/calendar/components/agenda-view/agenda-day-group";

import type { IEvent } from "@cc/calendar/interfaces";

interface IProps {
  singleDayEvents: IEvent[];
  multiDayEvents: IEvent[];
  hideEdit: boolean;
}

export function CalendarAgendaView({
  singleDayEvents,
  multiDayEvents,
  hideEdit,
}: IProps) {
  const { selectedDate } = useCalendar();
  const { t } = useTranslation();

  const eventsByDay = useMemo(() => {
    const now = new Date();
    const allDates = new Map<
      string,
      { date: Date; events: IEvent[]; multiDayEvents: IEvent[] }
    >();

    singleDayEvents.forEach((event) => {
      const eventDate = parseISO(event.startDate);
      if (!isSameMonth(eventDate, selectedDate)) return;
      
      // Only include events that are at or after the current time
      if (eventDate < now) return;

      const dateKey = format(eventDate, "yyyy-MM-dd");

      if (!allDates.has(dateKey)) {
        allDates.set(dateKey, {
          date: startOfDay(eventDate),
          events: [],
          multiDayEvents: [],
        });
      }

      allDates.get(dateKey)?.events.push(event);
    });

    multiDayEvents.forEach((event) => {
      const eventStart = parseISO(event.startDate);
      const eventEnd = parseISO(event.endDate);

      // Only include multi-day events that end at or after the current time
      if (eventEnd < now) return;

      let currentDate = startOfDay(eventStart);
      const lastDate = endOfDay(eventEnd);

      while (currentDate <= lastDate) {
        if (isSameMonth(currentDate, selectedDate)) {
          // For multi-day events, only show days that are today or in the future
          if (currentDate >= startOfDay(now)) {
            const dateKey = format(currentDate, "yyyy-MM-dd");

            if (!allDates.has(dateKey)) {
              allDates.set(dateKey, {
                date: new Date(currentDate),
                events: [],
                multiDayEvents: [],
              });
            }

            allDates.get(dateKey)?.multiDayEvents.push(event);
          }
        }
        currentDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
      }
    });

    return Array.from(allDates.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
  }, [singleDayEvents, multiDayEvents, selectedDate]);

  const hasAnyEvents = singleDayEvents.length > 0 || multiDayEvents.length > 0;

  return (
    <div className="twcal:h-[800px] fullgrowHeight">
      <ScrollArea className="twcal:h-full" type="always">
        <div className="twcal:space-y-6 twcal:p-4">
          {eventsByDay.map((dayGroup) => (
            <AgendaDayGroup
              hideEdit={hideEdit}
              key={format(dayGroup.date, "yyyy-MM-dd")}
              date={dayGroup.date}
              events={dayGroup.events}
              multiDayEvents={dayGroup.multiDayEvents}
            />
          ))}

          {!hasAnyEvents && (
            <div className="twcal:flex twcal:flex-col twcal:items-center twcal:justify-center twcal:gap-2 twcal:py-20 twcal:text-muted-foreground">
              <CalendarX2 className="twcal:size-10" />
              <p className="twcal:text-sm twcal:md:text-base">
                {t("messages.noEvents")}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
