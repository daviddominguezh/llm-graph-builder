import { format } from "date-fns";
import { useEffect, useState } from "react";

interface IProps {
  firstVisibleHour: number;
  lastVisibleHour: number;
}

export function CalendarTimeline({ firstVisibleHour, lastVisibleHour }: IProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const getCurrentTimePosition = () => {
    const minutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    const visibleStartMinutes = firstVisibleHour * 60;
    const visibleEndMinutes = lastVisibleHour * 60;
    const visibleRangeMinutes = visibleEndMinutes - visibleStartMinutes;

    return ((minutes - visibleStartMinutes) / visibleRangeMinutes) * 100;
  };

  const formatCurrentTime = () => {
    return format(currentTime, "h:mm a");
  };

  const currentHour = currentTime.getHours();
  if (currentHour < firstVisibleHour || currentHour >= lastVisibleHour) return null;

  return (
    <div className="twcal:pointer-events-none twcal:absolute twcal:inset-x-0 twcal:z-50 twcal:border-t twcal:border-primary" style={{ top: `${getCurrentTimePosition()}%` }}>
      <div className="twcal:absolute twcal:left-0 twcal:top-0 twcal:size-3 twcal:-translate-x-1/2 twcal:-translate-y-1/2 twcal:rounded-full twcal:bg-primary"></div>
      <div className="twcal:absolute twcal:-left-18 twcal:flex twcal:w-16 twcal:-translate-y-1/2 twcal:justify-end twcal:bg-background twcal:pr-1 twcal:text-xs twcal:font-medium twcal:text-primary">{formatCurrentTime()}</div>
    </div>
  );
}
