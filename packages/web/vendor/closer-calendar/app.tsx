import React from "react";
import { ClientContainer } from "./calendar/components/client-container";
import { CalendarProvider } from "./calendar/contexts/calendar-context";
import { TCalendarView, TVisibleHours, TWorkingHours } from "./calendar/types";
import { IEvent, IUser } from "./calendar/interfaces";
import { useResponsiveView } from "./hooks/use-responsive-view";

interface CalendarMainProps {
  workingHours: TWorkingHours;
  visibleHours: TVisibleHours;
  userData?: IUser[];
  eventData?: IEvent[];
  hideEdit?: boolean;
}

export const CalendarMain: React.FC<CalendarMainProps> = ({
  workingHours,
  visibleHours,
  userData = [],
  eventData = [],
  hideEdit = true,
}: CalendarMainProps) => {
  const [view, setView] = useResponsiveView("week", "day");

  const handleChangeView = (view: TCalendarView) => {
    setView(view);
  };

  return (
    <CalendarProvider
      users={userData}
      events={eventData}
      visibleH={visibleHours}
      workingH={workingHours}
    >
      <ClientContainer
        view={view}
        hideEdit={hideEdit}
        handleChangeView={handleChangeView}
      />
    </CalendarProvider>
  );
};

export default CalendarMain;
