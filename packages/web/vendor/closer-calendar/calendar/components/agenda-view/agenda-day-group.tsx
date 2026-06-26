import { differenceInDays, parseISO, startOfDay, isToday } from "date-fns";
import { useDateFormatting } from "@cc/lib/date-utils";

import { AgendaEventCard } from "@cc/calendar/components/agenda-view/agenda-event-card";

import type { IEvent } from "@cc/calendar/interfaces";

interface IProps {
  date: Date;
  events: IEvent[];
  multiDayEvents: IEvent[];
  hideEdit: boolean;
}

export function AgendaDayGroup({
  date,
  events,
  multiDayEvents,
  hideEdit,
}: IProps) {
  const { formatDate } = useDateFormatting();
  const now = new Date();
  
  // Filter events to only show future events (especially important for today)
  const filteredEvents = events.filter(event => {
    const eventDate = parseISO(event.startDate);
    return eventDate >= now;
  });
  
  // For multi-day events, show them if they're ongoing or will start in the future
  const filteredMultiDayEvents = multiDayEvents.filter(event => {
    const eventEnd = parseISO(event.endDate);
    return eventEnd >= now;
  });
  
  const sortedEvents = [...filteredEvents].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  // Don't render the day group if there are no future events
  if (sortedEvents.length === 0 && filteredMultiDayEvents.length === 0) {
    return null;
  }

  return (
    <div className="twcal:space-y-4">
      <div className="twcal:sticky twcal:top-0 twcal:flex twcal:items-center twcal:gap-4 twcal:bg-background twcal:py-2">
        <p className="twcal:text-sm twcal:font-semibold">
          {formatDate(date, "EEEE, MMMM d, yyyy", true)}
        </p>
      </div>

      <div className="twcal:space-y-2">
        {filteredMultiDayEvents.length > 0 &&
          filteredMultiDayEvents.map((event) => {
            const eventStart = startOfDay(parseISO(event.startDate));
            const eventEnd = startOfDay(parseISO(event.endDate));
            const currentDate = startOfDay(date);

            const eventTotalDays = differenceInDays(eventEnd, eventStart) + 1;
            const eventCurrentDay =
              differenceInDays(currentDate, eventStart) + 1;
            return (
              <AgendaEventCard
                hideEdit={hideEdit}
                key={event.id}
                event={event}
                eventCurrentDay={eventCurrentDay}
                eventTotalDays={eventTotalDays}
              />
            );
          })}

        {sortedEvents.length > 0 &&
          sortedEvents.map((event) => (
            <AgendaEventCard hideEdit={hideEdit} key={event.id} event={event} />
          ))}
      </div>
    </div>
  );
}
