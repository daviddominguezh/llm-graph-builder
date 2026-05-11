"use client";

import { useState } from "react";
import { Info, Moon } from "lucide-react";
import { useCalendar } from "@cc/calendar/contexts/calendar-context";
import { useTranslation } from "react-i18next";

import { Button } from "@cc/components/ui/button";
import { Switch } from "@cc/components/ui/switch";
import { TimeInput } from "@cc/components/ui/time-input";

import type { TimeValue } from "react-aria-components";
import { TooltipContent } from "@cc/components/ui/tooltip";
import { Tooltip, TooltipTrigger } from "@cc/components/ui/tooltip";
import { TooltipProvider } from "@cc/components/ui/tooltip";


export function ChangeWorkingHoursInput() {
  const { workingHours, setWorkingHours } = useCalendar();
  const { t } = useTranslation();

  const DAYS_OF_WEEK = [
    { index: 0, name: t("days.long.sunday") },
    { index: 1, name: t("days.long.monday") },
    { index: 2, name: t("days.long.tuesday") },
    { index: 3, name: t("days.long.wednesday") },
    { index: 4, name: t("days.long.thursday") },
    { index: 5, name: t("days.long.friday") },
    { index: 6, name: t("days.long.saturday") },
  ];

  const [localWorkingHours, setLocalWorkingHours] = useState({ ...workingHours });

  const handleToggleDay = (dayId: number) => {
    setLocalWorkingHours(prev => ({
      ...prev,
      [dayId]: prev[dayId].from > 0 || prev[dayId].to > 0 ? { from: 0, to: 0 } : { from: 9, to: 17 },
    }));
  };

  const handleTimeChange = (dayId: number, timeType: "from" | "to", value: TimeValue | null) => {
    if (!value) return;

    setLocalWorkingHours(prev => {
      const updatedDay = { ...prev[dayId], [timeType]: value.hour };
      if (timeType === "to" && value.hour === 0 && updatedDay.from === 0) updatedDay.to = 24;
      return { ...prev, [dayId]: updatedDay };
    });
  };

  const handleSave = () => {
    const updatedWorkingHours = { ...localWorkingHours };

    for (const dayId in updatedWorkingHours) {
      const day = updatedWorkingHours[parseInt(dayId)];
      const isDayActive = localWorkingHours[parseInt(dayId)].from > 0 || localWorkingHours[parseInt(dayId)].to > 0;

      if (isDayActive) {
        if (day.from === 0 && day.to === 0) {
          updatedWorkingHours[dayId] = { from: 0, to: 24 };
        } else if (day.to === 0 && day.from > 0) {
          updatedWorkingHours[dayId] = { ...day, to: 24 };
        }
      } else {
        updatedWorkingHours[dayId] = { from: 0, to: 0 };
      }
    }

    setWorkingHours(updatedWorkingHours);
  };

  return (
    <div className="twcal:flex twcal:flex-col twcal:gap-2">
      <div className="twcal:flex twcal:items-center twcal:gap-2">
        <p className="twcal:text-sm twcal:font-semibold">{t("settings.workingHours.title")}</p>

        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger>
              <Info className="twcal:size-3" />
            </TooltipTrigger>

            <TooltipContent className="twcal:max-w-80 twcal:text-center">
              <p>{t("settings.workingHours.tooltip")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="twcal:space-y-4">
        {DAYS_OF_WEEK.map(day => {
          const isDayActive = localWorkingHours[day.index].from > 0 || localWorkingHours[day.index].to > 0;

          return (
            <div key={day.index} className="twcal:flex twcal:items-center twcal:gap-4">
              <div className="twcal:flex twcal:w-40 twcal:items-center twcal:gap-2">
                <Switch checked={isDayActive} onCheckedChange={() => handleToggleDay(day.index)} />
                <span className="twcal:text-sm twcal:font-medium">{day.name}</span>
              </div>

              {isDayActive ? (
                <div className="twcal:flex twcal:items-center twcal:gap-4">
                  <div className="twcal:flex twcal:items-center twcal:gap-2">
                    <span>{t("settings.workingHours.from")}</span>
                    <TimeInput
                      id={`${day.name.toLowerCase()}-from`}
                      hourCycle={12}
                      granularity="hour"
                      value={{ hour: localWorkingHours[day.index].from, minute: 0 } as TimeValue}
                      onChange={value => handleTimeChange(day.index, "from", value)}
                    />
                  </div>

                  <div className="twcal:flex twcal:items-center twcal:gap-2">
                    <span>{t("settings.workingHours.to")}</span>
                    <TimeInput
                      id={`${day.name.toLowerCase()}-to`}
                      hourCycle={12}
                      granularity="hour"
                      value={{ hour: localWorkingHours[day.index].to, minute: 0 } as TimeValue}
                      onChange={value => handleTimeChange(day.index, "to", value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="twcal:flex twcal:items-center twcal:gap-2 twcal:text-muted-foreground">
                  <Moon className="twcal:size-4" />
                  <span>{t("settings.workingHours.closed")}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button className="twcal:mt-4 twcal:w-fit" onClick={handleSave}>
        {t("settings.workingHours.apply")}
      </Button>
    </div>
  );
}
