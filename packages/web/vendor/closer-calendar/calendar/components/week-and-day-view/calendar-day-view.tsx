import { useRef, useEffect } from "react";
import { Calendar, Clock, User } from "lucide-react";
import { parseISO, areIntervalsOverlapping } from "date-fns";
import { useDateFormatting } from "@cc/lib/date-utils";
import { useTranslation } from "react-i18next";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

import { ScrollArea } from "@cc/components/ui/scroll-area";
import { SingleCalendar } from "@cc/components/ui/single-calendar";

import { AddEventDialog } from "@cc/calendar/components/dialogs/add-event-dialog";
import { EventBlock } from "@cc/calendar/components/week-and-day-view/event-block";
import { DroppableTimeBlock } from "@cc/calendar/components/dnd/droppable-time-block";
import { CalendarTimeline } from "@cc/calendar/components/week-and-day-view/calendar-time-line";
import { DayViewMultiDayEventsRow } from "@cc/calendar/components/week-and-day-view/day-view-multi-day-events-row";

import { cn } from "@cc/lib/utils";
import {
  groupEvents,
  getEventBlockStyle,
  isWorkingHour,
  getCurrentEvents,
  getVisibleHours,
} from "@cc/calendar/helpers";

import type { IEvent } from "@cc/calendar/interfaces";

interface IProps {
  singleDayEvents: IEvent[];
  multiDayEvents: IEvent[];
  hideEdit: boolean;
}

export function CalendarDayView({
  singleDayEvents,
  multiDayEvents,
  hideEdit,
}: IProps) {
  const { selectedDate, setSelectedDate, users, visibleHours, workingHours } =
    useCalendar();
  const { t } = useTranslation();
  const { formatDate } = useDateFormatting();

  const { hours, earliestEventHour, latestEventHour } = getVisibleHours(
    visibleHours,
    singleDayEvents
  );

  const currentEvents = getCurrentEvents(singleDayEvents);

  const dayEvents = singleDayEvents.filter((event) => {
    const eventDate = parseISO(event.startDate);
    return (
      eventDate.getDate() === selectedDate.getDate() &&
      eventDate.getMonth() === selectedDate.getMonth() &&
      eventDate.getFullYear() === selectedDate.getFullYear()
    );
  });

  const groupedEvents = groupEvents(dayEvents);

  // Auto-scroll to current time
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const scrollToCurrentTime = () => {
      if (!scrollAreaRef.current) return;
      
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinutes = now.getMinutes();
      
      // Calculate position: each hour is 96px high
      const hourPosition = (currentHour - hours[0]) * 96;
      const minuteOffset = (currentMinutes / 60) * 96;
      const scrollPosition = hourPosition + minuteOffset;
      
      // Scroll to position with some offset to center the current time
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = Math.max(0, scrollPosition - 200);
      }
    };

    // Small delay to ensure the component is mounted
    const timer = setTimeout(scrollToCurrentTime, 100);
    return () => clearTimeout(timer);
  }, [hours, selectedDate]);

  return (
    <div className="twcal:flex fullgrowHeight">
      <div className="twcal:flex twcal:flex-1 twcal:flex-col">
        <div>
          <DayViewMultiDayEventsRow
            hideEdit={hideEdit}
            selectedDate={selectedDate}
            multiDayEvents={multiDayEvents}
          />

          {/* Day header */}
          <div className="twcal:relative twcal:z-20 twcal:flex twcal:border-b">
            <div className="twcal:w-18"></div>
            <span className="twcal:flex-1 twcal:border-l twcal:py-2 twcal:text-center twcal:text-xs twcal:font-medium twcal:text-muted-foreground">
              {formatDate(selectedDate, "EE", true)}{" "}
              <span className="twcal:font-semibold twcal:text-foreground">
                {formatDate(selectedDate, "d")}
              </span>
            </span>
          </div>
        </div>

        <ScrollArea ref={scrollAreaRef} className="twcal:h-[800px]" type="always">
          <div className="twcal:flex">
            {/* Hours column */}
            <div className="twcal:relative twcal:w-18">
              {hours.map((hour, index) => (
                <div
                  key={hour}
                  className="twcal:relative"
                  style={{ height: "96px" }}
                >
                  <div className="twcal:absolute twcal:-top-3 twcal:right-2 twcal:flex twcal:h-6 twcal:items-center">
                    {index !== 0 && (
                      <span className="twcal:text-xs twcal:text-muted-foreground">
                        {formatDate(new Date(new Date().setHours(hour, 0, 0, 0)), "hh a")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="twcal:relative twcal:flex-1 twcal:border-l">
              <div className="twcal:relative">
                {hours.map((hour, index) => {
                  const isDisabled = !isWorkingHour(
                    selectedDate,
                    hour,
                    workingHours
                  );

                  return (
                    <div
                      key={hour}
                      className={cn(
                        "twcal:relative",
                        isDisabled && "bg-calendar-disabled-hour"
                      )}
                      style={{ height: "96px" }}
                    >
                      {index !== 0 && (
                        <div className="twcal:pointer-events-none twcal:absolute twcal:inset-x-0 twcal:top-0 twcal:border-b"></div>
                      )}

                      <DroppableTimeBlock
                        date={selectedDate}
                        hour={hour}
                        minute={0}
                      >
                        <AddEventDialog
                          hideEdit={hideEdit}
                          startDate={selectedDate}
                          startTime={{ hour, minute: 0 }}
                        >
                          <div className="twcal:absolute twcal:inset-x-0 twcal:top-0 twcal:h-[24px] twcal:cursor-pointer twcal:transition-colors twcal:hover:bg-accent" />
                        </AddEventDialog>
                      </DroppableTimeBlock>

                      <DroppableTimeBlock
                        date={selectedDate}
                        hour={hour}
                        minute={15}
                      >
                        <AddEventDialog
                          hideEdit={hideEdit}
                          startDate={selectedDate}
                          startTime={{ hour, minute: 15 }}
                        >
                          <div className="twcal:absolute twcal:inset-x-0 twcal:top-[24px] twcal:h-[24px] twcal:cursor-pointer twcal:transition-colors twcal:hover:bg-accent" />
                        </AddEventDialog>
                      </DroppableTimeBlock>

                      <div className="twcal:pointer-events-none twcal:absolute twcal:inset-x-0 twcal:top-1/2 twcal:border-b twcal:border-dashed"></div>

                      <DroppableTimeBlock
                        date={selectedDate}
                        hour={hour}
                        minute={30}
                      >
                        <AddEventDialog
                          hideEdit={hideEdit}
                          startDate={selectedDate}
                          startTime={{ hour, minute: 30 }}
                        >
                          <div className="twcal:absolute twcal:inset-x-0 twcal:top-[48px] twcal:h-[24px] twcal:cursor-pointer twcal:transition-colors twcal:hover:bg-accent" />
                        </AddEventDialog>
                      </DroppableTimeBlock>

                      <DroppableTimeBlock
                        date={selectedDate}
                        hour={hour}
                        minute={45}
                      >
                        <AddEventDialog
                          hideEdit={hideEdit}
                          startDate={selectedDate}
                          startTime={{ hour, minute: 45 }}
                        >
                          <div className="twcal:absolute twcal:inset-x-0 twcal:top-[72px] twcal:h-[24px] twcal:cursor-pointer twcal:transition-colors twcal:hover:bg-accent" />
                        </AddEventDialog>
                      </DroppableTimeBlock>
                    </div>
                  );
                })}

                {groupedEvents.map((group, groupIndex) =>
                  group.map((event) => {
                    let style = getEventBlockStyle(
                      event,
                      selectedDate,
                      groupIndex,
                      groupedEvents.length,
                      { from: earliestEventHour, to: latestEventHour }
                    );
                    const hasOverlap = groupedEvents.some(
                      (otherGroup, otherIndex) =>
                        otherIndex !== groupIndex &&
                        otherGroup.some((otherEvent) =>
                          areIntervalsOverlapping(
                            {
                              start: parseISO(event.startDate),
                              end: parseISO(event.endDate),
                            },
                            {
                              start: parseISO(otherEvent.startDate),
                              end: parseISO(otherEvent.endDate),
                            }
                          )
                        )
                    );

                    if (!hasOverlap)
                      style = { ...style, width: "100%", left: "0%" };

                    return (
                      <div
                        key={event.id}
                        className="twcal:absolute twcal:p-1"
                        style={style}
                      >
                        <EventBlock event={event} hideEdit={hideEdit} />
                      </div>
                    );
                  })
                )}
              </div>

              <CalendarTimeline
                firstVisibleHour={earliestEventHour}
                lastVisibleHour={latestEventHour}
              />
            </div>
          </div>
        </ScrollArea>
      </div>

      <div className="twcal:hidden twcal:w-64 twcal:divide-y twcal:border-l twcal:md:block">
        <SingleCalendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          className="twcal:mx-auto twcal:w-fit"
        />

        <div className="twcal:flex-1 twcal:space-y-3">
          {currentEvents.length > 0 ? (
            <div className="twcal:flex twcal:items-start twcal:gap-2 twcal:px-4 twcal:pt-4">
              <span className="twcal:relative twcal:mt-[5px] twcal:flex twcal:size-2.5">
                <span className="twcal:absolute twcal:inline-flex twcal:size-full animate-ping twcal:rounded-full twcal:bg-green-400 twcal:opacity-75"></span>
                <span className="twcal:relative twcal:inline-flex twcal:size-2.5 twcal:rounded-full twcal:bg-green-600"></span>
              </span>

              <p className="twcal:text-sm twcal:font-semibold twcal:text-foreground">
                {t("messages.happeningNow")}
              </p>
            </div>
          ) : (
            <p className="twcal:p-4 twcal:text-center twcal:text-sm twcal:italic twcal:text-muted-foreground">
              {t("messages.noAppointments")}
            </p>
          )}

          {currentEvents.length > 0 && (
            <ScrollArea className="twcal:h-[422px] twcal:px-4" type="always">
              <div className="twcal:space-y-6 twcal:pb-4">
                {currentEvents.map((event) => {
                  const user = users.find((user) => user.id === event.user.id);

                  return (
                    <div key={event.id} className="twcal:space-y-1.5">
                      <p className="twcal:line-clamp-2 twcal:text-sm twcal:font-semibold">
                        {event.title}
                      </p>

                      {user && (
                        <div className="twcal:flex twcal:items-center twcal:gap-1.5 twcal:text-muted-foreground">
                          <User className="twcal:size-3.5" />
                          <span className="twcal:text-sm">{user.name}</span>
                        </div>
                      )}

                      <div className="twcal:flex twcal:items-center twcal:gap-1.5 twcal:text-muted-foreground">
                        <Calendar className="twcal:size-3.5" />
                        <span className="twcal:text-sm">
                          {formatDate(new Date(), "MMM d, yyyy")}
                        </span>
                      </div>

                      <div className="twcal:flex twcal:items-center twcal:gap-1.5 twcal:text-muted-foreground">
                        <Clock className="twcal:size-3.5" />
                        <span className="twcal:text-sm">
                          {formatDate(parseISO(event.startDate), "h:mm a")} -{" "}
                          {formatDate(parseISO(event.endDate), "h:mm a")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
