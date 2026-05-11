"use client";

import { parseISO } from "date-fns";
import { cva } from "class-variance-authority";
import { Clock, Text, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDateFormatting } from "@cc/lib/date-utils";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

import { EventDetailsDialog } from "@cc/calendar/components/dialogs/event-details-dialog";

import type { IEvent } from "@cc/calendar/interfaces";
import type { VariantProps } from "class-variance-authority";

const agendaEventCardVariants = cva(
  "twcal:flex twcal:select-none twcal:items-center twcal:justify-between twcal:gap-3 twcal:rounded-md twcal:border twcal:p-3 twcal:text-sm twcal:focus-visible:outline-none twcal:focus-visible:ring-1 twcal:focus-visible:ring-ring",
  {
    variants: {
      color: {
        // Colored variants
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

interface IProps {
  event: IEvent;
  eventCurrentDay?: number;
  eventTotalDays?: number;
  hideEdit: boolean;
}

export function AgendaEventCard({
  event,
  eventCurrentDay,
  eventTotalDays,
  hideEdit,
}: IProps) {
  const { badgeVariant } = useCalendar();
  const { t } = useTranslation();
  const { formatDate } = useDateFormatting();

  const startDate = parseISO(event.startDate);
  const endDate = parseISO(event.endDate);

  const color = (
    badgeVariant === "dot" ? `${event.color}-dot` : event.color
  ) as VariantProps<typeof agendaEventCardVariants>["color"];

  const agendaEventCardClasses = agendaEventCardVariants({ color });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (e.currentTarget instanceof HTMLElement) e.currentTarget.click();
    }
  };

  return (
    <EventDetailsDialog event={event} hideEdit={hideEdit}>
      <div
        role="button"
        tabIndex={0}
        className={agendaEventCardClasses}
        onKeyDown={handleKeyDown}
      >
        <div className="twcal:flex twcal:flex-col twcal:gap-2">
          <div className="twcal:flex twcal:items-center twcal:gap-1.5">
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

            <p className="twcal:font-medium">
              {eventCurrentDay && eventTotalDays && (
                <span className="twcal:mr-1 twcal:text-xs">
                  {t("messages.multiDayEvent", { currentDay: eventCurrentDay, totalDays: eventTotalDays })}
                </span>
              )}
              {event.title}
            </p>
          </div>

          <div className="twcal:mt-1 twcal:flex twcal:items-center twcal:gap-1">
            <User className="twcal:size-3 twcal:shrink-0" />
            <p className="twcal:text-xs twcal:text-foreground">{event.user.name}</p>
          </div>

          <div className="twcal:flex twcal:items-center twcal:gap-1">
            <Clock className="twcal:size-3 twcal:shrink-0" />
            <p className="twcal:text-xs twcal:text-foreground">
              {formatDate(startDate, "h:mm a")} - {formatDate(endDate, "h:mm a")}
            </p>
          </div>

          <div className="twcal:flex twcal:items-center twcal:gap-1">
            <Text className="twcal:size-3 twcal:shrink-0" />
            <p className="twcal:text-xs twcal:text-foreground">{event.description}</p>
          </div>
        </div>
      </div>
    </EventDetailsDialog>
  );
}
