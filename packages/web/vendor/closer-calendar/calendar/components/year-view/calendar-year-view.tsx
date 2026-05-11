import { useMemo } from "react";
import { addMonths, startOfYear } from "date-fns";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

import { YearViewMonth } from "@cc/calendar/components/year-view/year-view-month";

import type { IEvent } from "@cc/calendar/interfaces";

interface IProps {
  allEvents: IEvent[];
}

export function CalendarYearView({ allEvents }: IProps) {
  const { selectedDate } = useCalendar();

  const months = useMemo(() => {
    const yearStart = startOfYear(selectedDate);
    return Array.from({ length: 12 }, (_, i) => addMonths(yearStart, i));
  }, [selectedDate]);

  return (
    <div className="twcal:p-4 fullgrowHeight twcal:overflow-scroll">
      <div className="twcal:grid twcal:grid-cols-1 twcal:gap-4 twcal:md:grid-cols-2 twcal:lg:grid-cols-3 twcal:xl:grid-cols-4">
        {months.map(month => (
          <YearViewMonth key={month.toString()} month={month} events={allEvents} />
        ))}
      </div>
    </div>
  );
}
