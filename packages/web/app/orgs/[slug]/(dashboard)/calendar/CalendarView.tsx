'use client';

import { CalendarMain, type TVisibleHours, type TWorkingHours } from 'closer-calendar';

const DEFAULT_WORKING_HOURS: TWorkingHours = {
  0: { from: 0, to: 0 },
  1: { from: 9, to: 17 },
  2: { from: 9, to: 17 },
  3: { from: 9, to: 17 },
  4: { from: 9, to: 17 },
  5: { from: 9, to: 17 },
  6: { from: 0, to: 0 },
};

const DEFAULT_VISIBLE_HOURS: TVisibleHours = { from: 0, to: 24 };

export function CalendarView(): React.JSX.Element {
  return (
    <div className="h-full w-full">
      <CalendarMain
        workingHours={DEFAULT_WORKING_HOURS}
        visibleHours={DEFAULT_VISIBLE_HOURS}
        userData={[]}
        eventData={[]}
      />
    </div>
  );
}
