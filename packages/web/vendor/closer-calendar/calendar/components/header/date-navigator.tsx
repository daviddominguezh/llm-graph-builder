import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDateFormatting } from "@cc/lib/date-utils";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

import { Badge } from "@cc/components/ui/badge";
import { Button } from "@cc/components/ui/button";

import { getEventsCount, navigateDate, rangeText } from "@cc/calendar/helpers";

import type { IEvent } from "@cc/calendar/interfaces";
import type { TCalendarView } from "@cc/calendar/types";


interface IProps {
  view: TCalendarView;
  events: IEvent[];
}

export function DateNavigator({ view, events }: IProps) {
  const { selectedDate, setSelectedDate } = useCalendar();
  const { t, i18n } = useTranslation();
  const { formatDate } = useDateFormatting();

  const month = formatDate(selectedDate, "MMMM", true);
  const year = selectedDate.getFullYear();

  const eventCount = useMemo(
    () => getEventsCount(events, selectedDate, view),
    [events, selectedDate, view]
  );

  const handlePrevious = () =>
    setSelectedDate(navigateDate(selectedDate, view, "previous"));
  const handleNext = () =>
    setSelectedDate(navigateDate(selectedDate, view, "next"));

  return (
    <div className="twcal:space-y-0.5">
      <div className="twcal:flex twcal:items-center twcal:gap-2">
        <span className="twcal:text-lg twcal:font-semibold">
          {month} {year}
        </span>
        <Badge variant="outline" className="twcal:px-1.5">
          {eventCount} {t("navigation.events")}
        </Badge>
      </div>

      <div className="twcal:flex twcal:items-center twcal:gap-2">
        <Button
          variant="outline"
          className="twcal:size-6.5 twcal:px-0 [&_svg]:twcal:size-4.5"
          onClick={handlePrevious}
        >
          <ChevronLeft />
        </Button>

        <p className="twcal:text-sm twcal:text-muted-foreground">
          {rangeText(view, selectedDate, formatDate, i18n.language)}
        </p>

        <Button
          variant="outline"
          className="twcal:size-6.5 twcal:px-0 [&_svg]:twcal:size-4.5"
          onClick={handleNext}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
