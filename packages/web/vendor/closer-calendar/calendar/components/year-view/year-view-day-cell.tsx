import { isToday } from "date-fns";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

import { cn } from "@cc/lib/utils";

import type { IEvent } from "@cc/calendar/interfaces";

interface IProps {
  day: number;
  date: Date;
  events: IEvent[];
}

export function YearViewDayCell({ day, date, events }: IProps) {
  
  const { setSelectedDate } = useCalendar();

  const maxIndicators = 3;
  const eventCount = events.length;

  const handleClick = () => {
    setSelectedDate(date);
  };

  return (
    <button
      onClick={handleClick}
      type="button"
      className="twcal:flex twcal:h-11 twcal:flex-1 twcal:flex-col twcal:items-center twcal:justify-start twcal:gap-0.5 twcal:rounded-md twcal:pt-1 twcal:hover:bg-accent twcal:focus-visible:outline-none twcal:focus-visible:ring-1 twcal:focus-visible:ring-ring"
    >
      <div
        className={cn(
          "twcal:flex twcal:size-6 twcal:items-center twcal:justify-center twcal:rounded-full twcal:text-xs twcal:font-medium",
          isToday(date) && "twcal:bg-primary twcal:font-semibold twcal:text-primary-foreground"
        )}
      >
        {day}
      </div>

      {eventCount > 0 && (
        <div className="twcal:mt-0.5 twcal:flex twcal:gap-0.5">
          {eventCount <= maxIndicators ? (
            events.map(event => (
              <div
                key={event.id}
                className={cn(
                  "twcal:size-1.5 twcal:rounded-full",
                  event.color === "blue" && "twcal:bg-blue-600",
                  event.color === "green" && "twcal:bg-green-600",
                  event.color === "red" && "twcal:bg-red-600",
                  event.color === "yellow" && "twcal:bg-yellow-600",
                  event.color === "purple" && "twcal:bg-purple-600",
                  event.color === "orange" && "twcal:bg-orange-600",
                  event.color === "gray" && "twcal:bg-neutral-600"
                )}
              />
            ))
          ) : (
            <>
              <div
                className={cn(
                  "twcal:size-1.5 twcal:rounded-full",
                  events[0].color === "blue" && "twcal:bg-blue-600",
                  events[0].color === "green" && "twcal:bg-green-600",
                  events[0].color === "red" && "twcal:bg-red-600",
                  events[0].color === "yellow" && "twcal:bg-yellow-600",
                  events[0].color === "purple" && "twcal:bg-purple-600",
                  events[0].color === "orange" && "twcal:bg-orange-600"
                )}
              />
              <span className="twcal:text-[7px] twcal:text-muted-foreground">+{eventCount - 1}</span>
            </>
          )}
        </div>
      )}
    </button>
  );
}
