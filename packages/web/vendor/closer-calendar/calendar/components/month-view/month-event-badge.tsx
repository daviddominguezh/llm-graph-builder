import { cva } from "class-variance-authority";
import { endOfDay, format, isSameDay, parseISO, startOfDay } from "date-fns";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

import { DraggableEvent } from "@cc/calendar/components/dnd/draggable-event";
import { EventDetailsDialog } from "@cc/calendar/components/dialogs/event-details-dialog";

import { cn } from "@cc/lib/utils";

import type { IEvent } from "@cc/calendar/interfaces";
import type { VariantProps } from "class-variance-authority";

const eventBadgeVariants = cva(
  "twcal:mx-1 twcal:flex twcal:size-auto twcal:h-6.5 twcal:select-none twcal:items-center twcal:justify-between twcal:gap-1.5 twcal:truncate twcal:whitespace-nowrap twcal:rounded-md twcal:border twcal:px-2 twcal:text-xs twcal:focus-visible:outline-none twcal:focus-visible:ring-1 twcal:focus-visible:ring-ring",
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
        gray: "twcal:border-neutral-200 twcal:bg-neutral-50 twcal:text-neutral-900 dark:twcal:border-neutral-700 dark:twcal:bg-neutral-900 dark:twcal:text-neutral-300 [&_.event-dot]:twcal:fill-neutral-600",

        // Dot variants
        "blue-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-blue-600",
        "green-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-green-600",
        "red-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-red-600",
        "yellow-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-yellow-600",
        "purple-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-purple-600",
        "orange-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-orange-600",
        "gray-dot":
          "twcal:bg-neutral-50 dark:twcal:bg-neutral-900 [&_.event-dot]:twcal:fill-neutral-600",
      },
      multiDayPosition: {
        first:
          "twcal:relative twcal:z-10 twcal:mr-0 twcal:w-[calc(100%_-_3px)] twcal:rounded-r-none twcal:border-r-0 [&>span]:twcal:mr-2.5",
        middle:
          "twcal:relative twcal:z-10 twcal:mx-0 twcal:w-[calc(100%_+_1px)] twcal:rounded-none twcal:border-x-0",
        last: "twcal:ml-0 twcal:rounded-l-none twcal:border-l-0",
        none: "",
      },
    },
    defaultVariants: {
      color: "blue-dot",
    },
  }
);

interface IProps
  extends Omit<
    VariantProps<typeof eventBadgeVariants>,
    "color" | "multiDayPosition"
  > {
  event: IEvent;
  cellDate: Date;
  eventCurrentDay?: number;
  eventTotalDays?: number;
  className?: string;
  position?: "first" | "middle" | "last" | "none";
  hideEdit: boolean;
}

export function MonthEventBadge({
  event,
  hideEdit,
  cellDate,
  eventCurrentDay,
  eventTotalDays,
  className,
  position: propPosition,
}: IProps) {
  const { badgeVariant } = useCalendar();

  const itemStart = startOfDay(parseISO(event.startDate));
  const itemEnd = endOfDay(parseISO(event.endDate));

  if (cellDate < itemStart || cellDate > itemEnd) return null;

  let position: "first" | "middle" | "last" | "none" | undefined;

  if (propPosition) {
    position = propPosition;
  } else if (eventCurrentDay && eventTotalDays) {
    position = "none";
  } else if (isSameDay(itemStart, itemEnd)) {
    position = "none";
  } else if (isSameDay(cellDate, itemStart)) {
    position = "first";
  } else if (isSameDay(cellDate, itemEnd)) {
    position = "last";
  } else {
    position = "middle";
  }

  const renderBadgeText = ["first", "none"].includes(position);

  const color = (
    badgeVariant === "dot" ? `${event.color}-dot` : event.color
  ) as VariantProps<typeof eventBadgeVariants>["color"];

  const eventBadgeClasses = cn(
    eventBadgeVariants({ color, multiDayPosition: position, className })
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
        className={eventBadgeClasses}
        onKeyDown={handleKeyDown}
      >
        <div className="twcal:flex twcal:items-center twcal:gap-1.5 twcal:truncate">
          {!["middle", "last"].includes(position) &&
            ["mixed", "dot"].includes(badgeVariant) && (
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                className="event-dot twcal:shrink-0"
              >
                <circle cx="4" cy="4" r="4" />
              </svg>
            )}

          {renderBadgeText && (
            <p className="twcal:flex-1 twcal:truncate twcal:font-semibold">
              {eventCurrentDay && (
                <span className="twcal:text-xs">
                  Day {eventCurrentDay} of {eventTotalDays} •{" "}
                </span>
              )}
              {event.title}
            </p>
          )}
        </div>

        {renderBadgeText && (
          <span>{format(new Date(event.startDate), "h:mm a")}</span>
        )}
      </div>
    </EventDetailsDialog>
  );

  if (hideEdit) return content;

  return <DraggableEvent event={event}>{content}</DraggableEvent>;
}
