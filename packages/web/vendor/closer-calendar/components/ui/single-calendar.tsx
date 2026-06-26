"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { buttonVariants } from "@cc/components/ui/button";
import { getDateFnsLocale, capitalize } from "@cc/lib/date-utils";

import { cn } from "@cc/lib/utils";
import { format } from "date-fns";

import type { DayPickerSingleProps } from "react-day-picker";

function SingleCalendar({
  className,
  classNames,
  showOutsideDays = true,
  selected,
  ...props
}: DayPickerSingleProps) {
  const { i18n } = useTranslation();
  const [currentMonth, setCurrentMonth] = React.useState<Date | undefined>(
    selected instanceof Date ? selected : undefined
  );

  const locale = getDateFnsLocale(i18n.language);

  const formatters = {
    formatCaption: (date: Date) => {
      return capitalize(format(date, "MMMM yyyy", { locale }));
    },
    formatWeekdayName: (date: Date) => {
      return capitalize(format(date, "EEEEE", { locale }));
    },
  };

  return (
    <DayPicker
      selected={selected}
      showOutsideDays={showOutsideDays}
      month={currentMonth}
      onMonthChange={setCurrentMonth}
      locale={locale}
      formatters={formatters}
      className={cn("twcal:p-3", className)}
      classNames={{
        months:
          "twcal:flex twcal:flex-col twcal:sm:flex-row twcal:space-y-4 twcal:sm:space-x-4 twcal:sm:space-y-0",
        month: "twcal:space-y-4",
        caption:
          "twcal:flex twcal:justify-center twcal:pt-1 twcal:relative twcal:items-center",
        caption_label: "twcal:text-sm twcal:font-medium",
        nav: "twcal:space-x-1 twcal:flex twcal:items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "twcal:h-7 twcal:w-7 twcal:bg-transparent twcal:p-0 twcal:opacity-50 twcal:hover:opacity-100"
        ),
        nav_button_previous: "twcal:absolute twcal:left-1",
        nav_button_next: "twcal:absolute twcal:right-1",
        table: "backg twcal:w-full twcal:border-collapse twcal:space-y-1",
        head_row: "twcal:flex",
        head_cell:
          "twcal:text-muted-foreground twcal:rounded-md twcal:w-8 twcal:font-normal twcal:text-[0.8rem]",
        row: "twcal:flex twcal:w-full twcal:mt-2",
        cell: cn(
          "twcal:relative twcal:p-0 twcal:text-center twcal:text-sm twcal:focus-within:relative twcal:focus-within:z-20 twcal:[&:has([aria-selected])]:bg-accent twcal:[&:has([aria-selected].day-outside)]:bg-accent/50 twcal:[&:has([aria-selected].day-range-end)]:rounded-r-md",
          "twcal:[&:has([aria-selected])]:rounded-md"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "twcal:h-8 twcal:w-8 twcal:p-0 twcal:font-normal twcal:aria-selected:opacity-100"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "twcal:bg-primary twcal:text-primary-foreground twcal:hover:bg-primary twcal:hover:text-primary-foreground twcal:focus:bg-primary twcal:focus:text-primary-foreground",
        day_today: "twcal:bg-accent twcal:text-accent-foreground",
        day_outside:
          "day-outside twcal:text-muted-foreground twcal:aria-selected:bg-accent/50 twcal:aria-selected:text-muted-foreground",
        day_disabled: "twcal:text-muted-foreground twcal:opacity-50",
        day_range_middle:
          "twcal:aria-selected:bg-accent twcal:aria-selected:text-accent-foreground",
        day_hidden: "twcal:invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft
            className={cn("twcal:h-4 twcal:w-4", className)}
            {...props}
          />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight
            className={cn("twcal:h-4 twcal:w-4", className)}
            {...props}
          />
        ),
      }}
      {...props}
    />
  );
}
SingleCalendar.displayName = "Calendar";

export { SingleCalendar };
