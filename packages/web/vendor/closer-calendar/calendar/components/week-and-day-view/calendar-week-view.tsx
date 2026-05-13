import {
  startOfWeek,
  addDays,
  parseISO,
  isSameDay,
  areIntervalsOverlapping,
  isToday,
} from "date-fns";
import { useDateFormatting } from "@cc/lib/date-utils";
import { useTranslation } from "react-i18next";
import { useRef, useEffect } from "react";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

import { ScrollArea } from "@cc/components/ui/scroll-area";

import { AddEventDialog } from "@cc/calendar/components/dialogs/add-event-dialog";
import { EventBlock } from "@cc/calendar/components/week-and-day-view/event-block";
import { DroppableTimeBlock } from "@cc/calendar/components/dnd/droppable-time-block";
import { CalendarTimeline } from "@cc/calendar/components/week-and-day-view/calendar-time-line";
import { WeekViewMultiDayEventsRow } from "@cc/calendar/components/week-and-day-view/week-view-multi-day-events-row";

import { cn } from "@cc/lib/utils";
import {
  groupEvents,
  getEventBlockStyle,
  isWorkingHour,
  getVisibleHours,
} from "@cc/calendar/helpers";

import type { IEvent } from "@cc/calendar/interfaces";

interface IProps {
  singleDayEvents: IEvent[];
  multiDayEvents: IEvent[];
  hideEdit: boolean;
}

export function CalendarWeekView({
  singleDayEvents,
  multiDayEvents,
  hideEdit,
}: IProps) {
  const { selectedDate, workingHours, visibleHours } = useCalendar();
  const { t } = useTranslation();
  const { formatDate } = useDateFormatting();

  const { hours, earliestEventHour, latestEventHour } = getVisibleHours(
    visibleHours,
    singleDayEvents
  );

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday = 1
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

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
    <>
      <div className="twcal:flex twcal:flex-col twcal:justify-center twcal:border-b twcal:px-6 twcal:py-8 twcal:text-sm twcal:text-muted-foreground twcal:sm:hidden">
        <div>{t("messages.weeklyViewNotAvailable")}</div>
        <div>{t("messages.switchToOtherView")}</div>
      </div>

      <div className="twcal:hidden twcal:flex-col twcal:sm:flex fullgrowHeight">
        <div>
          <WeekViewMultiDayEventsRow
            hideEdit={hideEdit}
            selectedDate={selectedDate}
            multiDayEvents={multiDayEvents}
          />

          {/* Week header */}
          <div className="twcal:relative twcal:z-20 twcal:flex twcal:border-b">
            <div className="twcal:w-18"></div>
            <div className="twcal:grid twcal:flex-1 twcal:grid-cols-7 twcal:divide-x twcal:border-l">
              {weekDays.map((day, index) => {
                const isDayToday = isToday(day);
                return (
                  <span
                    key={index}
                    className={cn(
                      "twcal:py-2 twcal:text-center twcal:text-xs twcal:font-medium twcal:text-muted-foreground",
                      isDayToday && "twcal:bg-accent twcal:text-accent-foreground"
                    )}
                  >
                    {formatDate(day, "EE", true)}{" "}
                    <span className={`twcal:ml-1 twcal:font-semibold  ${isDayToday ? 'twcal:text-accent-foreground': 'twcal:text-foreground'}`}>
                      {formatDate(day, "d")}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <ScrollArea ref={scrollAreaRef} className="twcal:h-[736px]" type="always">
          <div className="twcal:flex twcal:overflow-hidden">
            {/* Hours column */}
            <div className="twcal:relative twcal:w-18">
              {hours.map((hour, index) => (
                <div key={hour} className="twcal:relative" style={{ height: "96px" }}>
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

            {/* Week grid */}
            <div className="twcal:relative twcal:flex-1 twcal:border-l">
              <div className="twcal:grid twcal:grid-cols-7 twcal:divide-x">
                {weekDays.map((day, dayIndex) => {
                  const dayEvents = singleDayEvents.filter(
                    (event) =>
                      isSameDay(parseISO(event.startDate), day) ||
                      isSameDay(parseISO(event.endDate), day)
                  );
                  const groupedEvents = groupEvents(dayEvents);

                  return (
                    <div key={dayIndex} className="twcal:relative">
                      {hours.map((hour, index) => {
                        const isDisabled = !isWorkingHour(
                          day,
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
                              date={day}
                              hour={hour}
                              minute={0}
                            >
                              <AddEventDialog
                                startDate={day}
                                startTime={{ hour, minute: 0 }}
                                hideEdit={hideEdit}
                              >
                                <div className="twcal:absolute twcal:inset-x-0 twcal:top-0 twcal:h-[24px] twcal:cursor-pointer twcal:transition-colors twcal:hover:bg-accent" />
                              </AddEventDialog>
                            </DroppableTimeBlock>

                            <DroppableTimeBlock
                              date={day}
                              hour={hour}
                              minute={15}
                            >
                              <AddEventDialog
                                startDate={day}
                                startTime={{ hour, minute: 15 }}
                                hideEdit={hideEdit}
                              >
                                <div className="twcal:absolute twcal:inset-x-0 twcal:top-[24px] twcal:h-[24px] twcal:cursor-pointer twcal:transition-colors twcal:hover:bg-accent" />
                              </AddEventDialog>
                            </DroppableTimeBlock>

                            <div className="twcal:pointer-events-none twcal:absolute twcal:inset-x-0 twcal:top-1/2 twcal:border-b twcal:border-dashed"></div>

                            <DroppableTimeBlock
                              date={day}
                              hour={hour}
                              minute={30}
                            >
                              <AddEventDialog
                                startDate={day}
                                startTime={{ hour, minute: 30 }}
                                hideEdit={hideEdit}
                              >
                                <div className="twcal:absolute twcal:inset-x-0 twcal:top-[48px] twcal:h-[24px] twcal:cursor-pointer twcal:transition-colors twcal:hover:bg-accent" />
                              </AddEventDialog>
                            </DroppableTimeBlock>

                            <DroppableTimeBlock
                              date={day}
                              hour={hour}
                              minute={45}
                            >
                              <AddEventDialog
                                startDate={day}
                                startTime={{ hour, minute: 45 }}
                                hideEdit={hideEdit}
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
                            day,
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
                  );
                })}
              </div>

              <CalendarTimeline
                firstVisibleHour={earliestEventHour}
                lastVisibleHour={latestEventHour}
              />
            </div>
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
