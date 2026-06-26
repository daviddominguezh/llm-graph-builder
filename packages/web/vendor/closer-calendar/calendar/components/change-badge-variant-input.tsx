"use client";

import { useCalendar } from "@cc/calendar/contexts/calendar-context";
import { useTranslation } from "react-i18next";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@cc/components/ui/select";

export function ChangeBadgeVariantInput() {
  const { badgeVariant, setBadgeVariant } = useCalendar();
  const { t } = useTranslation();

  return (
    <div className="twcal:space-y-2">
      <p className="twcal:text-sm twcal:font-semibold">{t("settings.badgeVariant.title")}</p>

      <Select value={badgeVariant} onValueChange={setBadgeVariant}>
        <SelectTrigger className="twcal:w-48">
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value="dot">{t("settings.badgeVariant.dot")}</SelectItem>
          <SelectItem value="colored">{t("settings.badgeVariant.colored")}</SelectItem>
          <SelectItem value="mixed">{t("settings.badgeVariant.mixed")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
