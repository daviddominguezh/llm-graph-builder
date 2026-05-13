import { formatDate } from "date-fns";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

export function TodayButton() {
  const { setSelectedDate } = useCalendar();

  const today = new Date();
  const handleClick = () => setSelectedDate(today);

  return (
    <button
      className="twcal:flex twcal:size-14 twcal:flex-col twcal:items-start twcal:overflow-hidden twcal:rounded-lg twcal:border twcal:focus-visible:outline-none twcal:focus-visible:ring-1 twcal:focus-visible:ring-ring"
      onClick={handleClick}
    >
      <p className="twcal:flex twcal:h-6 twcal:w-full twcal:items-center twcal:justify-center twcal:bg-primary twcal:text-center twcal:text-xs twcal:font-semibold twcal:text-primary-foreground">
        {formatDate(today, "MMM").toUpperCase()}
      </p>
      <p className="twcal:flex twcal:w-full twcal:items-center twcal:justify-center twcal:text-lg twcal:font-bold">{today.getDate()}</p>
    </button>
  );
}
