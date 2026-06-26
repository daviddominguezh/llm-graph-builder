import { cva } from "class-variance-authority";
import { differenceInMinutes, parseISO } from "date-fns";
import { useDateFormatting } from "@cc/lib/date-utils";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

import { DraggableEvent } from "@cc/calendar/components/dnd/draggable-event";
import { EventDetailsDialog } from "@cc/calendar/components/dialogs/event-details-dialog";

import { cn } from "@cc/lib/utils";

import type { HTMLAttributes } from "react";
import type { IEvent } from "@cc/calendar/interfaces";
import type { VariantProps } from "class-variance-authority";

const calendarWeekEventCardVariants = cva(
  "twcal:cursor-pointer twcal:flex twcal:select-none twcal:flex-col twcal:gap-0.5 twcal:truncate twcal:whitespace-nowrap twcal:rounded-md twcal:border twcal:px-2 twcal:py-1.5 twcal:text-xs twcal:focus-visible:outline-none twcal:focus-visible:ring-1 twcal:focus-visible:ring-ring",
  {
    variants: {
      color: {
        // Colored and mixed variants
        blue: "twcal:border-blue-200 twcal:bg-blue-50 twcal:text-blue-700 dark:twcal:border-blue-800 dark:twcal:bg-blue-950 dark:twcal:text-blue-300 [&_.event-dot]:twcal:fill-blue-600",
        green:
          "twcal:border-green-200 twcal:bg-green-50 twcal:text-green-700 dark:twcal:border-green-800 dark:twcal:bg-green-950 dark:twcal:text-green-300 [&_.event-dot]:twcal:fill-green-600",
        red: "twcal:border-red-200 twcal:bg-red-50 twcal:text-red-700 dark:twcal:border-red-800 dark:twcal:bg-red-950 dark:twcal:text-red-300 [&_.event-dot]:twcal:fill-red-600",
        yellow:
          "twcal:border-yellow-200 twcal:bg-yellow-50 twcal:text-yellow-700 dark:twcal:border-yellow-800 dark:twcal:bg-yellow-950 dark:twcal:text-yellow-300 [&_.event-dot]:twcal:fill-yellow-600",
        purple:
          "twcal:border-purple-200 twcal:bg-purple-50 twcal:text-purple-700 dark:twcal:border-purple-800 dark:twcal:bg-purple-950 dark:twcal:text-purple-300 [&_.event-dot]:twcal:fill-purple-600",
        orange:
          "twcal:border-orange-200 twcal:bg-orange-50 twcal:text-orange-700 dark:twcal:border-orange-800 dark:twcal:bg-orange-950 dark:twcal:text-orange-300 [&_.event-dot]:twcal:fill-orange-600",
        gray: "twcal:border-neutral-200 twcal:bg-neutral-50 twcal:text-neutral-700 dark:twcal:border-neutral-700 dark:twcal:bg-neutral-900 dark:twcal:text-neutral-300 [&_.event-dot]:twcal:fill-neutral-600",

        // Dot variants
        "blue-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-blue-600",
        "green-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-green-600",
        "red-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-red-600",
        "orange-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-orange-600",
        "purple-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-purple-600",
        "yellow-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-yellow-600",
        "gray-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-neutral-600",
      },
    },
    defaultVariants: {
      color: "blue-dot",
    },
  }
);

interface IProps
  extends HTMLAttributes<HTMLDivElement>,
    Omit<VariantProps<typeof calendarWeekEventCardVariants>, "color"> {
  event: IEvent;
  hideEdit: boolean;
}

export function EventBlock({ event, hideEdit, className }: IProps) {
  const { badgeVariant } = useCalendar();
  const { formatDate } = useDateFormatting();

  const start = parseISO(event.startDate);
  const end = parseISO(event.endDate);
  const durationInMinutes = differenceInMinutes(end, start);
  const heightInPixels = (durationInMinutes / 60) * 96 - 8;

  const color = (
    badgeVariant === "dot" ? `${event.color}-dot` : event.color
  ) as VariantProps<typeof calendarWeekEventCardVariants>["color"];

  const calendarWeekEventCardClasses = cn(
    calendarWeekEventCardVariants({ color, className }),
    durationInMinutes < 35 && "twcal:py-0 twcal:justify-center"
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (e.currentTarget instanceof HTMLElement) e.currentTarget.click();
    }
  };

  const content = (
    <EventDetailsDialog event={event} hideEdit={hideEdit}>
      <div
        role="button"
        tabIndex={0}
        className={calendarWeekEventCardClasses}
        style={{ height: `${heightInPixels}px` }}
        onKeyDown={handleKeyDown}
      >
        <div className="twcal:flex twcal:items-center twcal:gap-1.5 twcal:truncate">
          {["mixed", "dot"].includes(badgeVariant) && (
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              className="event-dot twcal:shrink-0"
            >
              <circle cx="4" cy="4" r="4" />
            </svg>
          )}

          <p className="twcal:truncate twcal:font-semibold">{event.title}</p>
        </div>

        {durationInMinutes > 25 && (
          <p>
            {formatDate(start, "h:mm a")} - {formatDate(end, "h:mm a")}
          </p>
        )}
      </div>
    </EventDetailsDialog>
  );

  if (hideEdit) return content;

  return <DraggableEvent event={event}>{content}</DraggableEvent>;
}
