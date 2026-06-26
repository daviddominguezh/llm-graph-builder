"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";

import { Button } from "@cc/components/ui/button";
import { TimeInput } from "@cc/components/ui/time-input";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@cc/components/ui/tooltip";

import type { TimeValue } from "react-aria-components";

export function ChangeVisibleHoursInput() {
  const { visibleHours, setVisibleHours } = useCalendar();
  const { t } = useTranslation();

  const [from, setFrom] = useState<{ hour: number; minute: number }>({ hour: visibleHours.from, minute: 0 });
  const [to, setTo] = useState<{ hour: number; minute: number }>({ hour: visibleHours.to, minute: 0 });

  const handleApply = () => {
    const toHour = to.hour === 0 ? 24 : to.hour;
    setVisibleHours({ from: from.hour, to: toHour });
  };

  return (
    <div className="twcal:flex twcal:flex-col twcal:gap-2">
      <div className="twcal:flex twcal:items-center twcal:gap-2">
        <p className="twcal:text-sm twcal:font-semibold">{t("settings.visibleHours.title")}</p>

        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger>
              <Info className="twcal:size-3" />
            </TooltipTrigger>

            <TooltipContent className="twcal:max-w-80 twcal:text-center">
              <p>{t("settings.visibleHours.tooltip")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="twcal:flex twcal:items-center twcal:gap-4">
        <p>{t("settings.visibleHours.from")}</p>
        <TimeInput id="start-time" hourCycle={12} granularity="hour" value={from as TimeValue} onChange={setFrom as (value: TimeValue | null) => void} />
        <p>{t("settings.visibleHours.to")}</p>
        <TimeInput id="end-time" hourCycle={12} granularity="hour" value={to as TimeValue} onChange={setTo as (value: TimeValue | null) => void} />
      </div>

      <Button className="twcal:mt-4 twcal:w-fit" onClick={handleApply}>
        {t("settings.visibleHours.apply")}
      </Button>
    </div>
  );
}
