// import Link from "next/link";
import {
  Columns,
  Grid3x3,
  List,
  Plus,
  Grid2x2,
  CalendarRange,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@cc/components/ui/button";

import { UserSelect } from "@cc/calendar/components/header/user-select";
import { TodayButton } from "@cc/calendar/components/header/today-button";
import { DateNavigator } from "@cc/calendar/components/header/date-navigator";
import { AddEventDialog } from "@cc/calendar/components/dialogs/add-event-dialog";

import type { IEvent } from "@cc/calendar/interfaces";
import type { TCalendarView } from "@cc/calendar/types";

interface IProps {
  view: TCalendarView;
  events: IEvent[];
  hideEdit: boolean;
  handleChangeView: (view: TCalendarView) => void;
}

export function CalendarHeader({
  view,
  events,
  hideEdit,
  handleChangeView,
}: IProps) {
  const { t } = useTranslation();
  return (
    <div className="twcal:flex twcal:flex-col twcal:gap-4 twcal:border-b twcal:p-0 twcal:pb-4 twcal:lg:flex-row twcal:lg:items-center twcal:lg:justify-between">
      <div className="twcal:flex twcal:items-center twcal:gap-3">
        <TodayButton />
        <DateNavigator view={view} events={events} />
      </div>

      <div className="twcal:flex twcal:flex-col twcal:items-center twcal:gap-1.5 twcal:sm:flex-row twcal:sm:justify-between">
        <div className="twcal:flex twcal:w-full twcal:items-center twcal:gap-1.5">
          <div className="twcal:inline-flex twcal:first:rounded-r-none twcal:last:rounded-l-none twcal:[&:not(:first-child):not(:last-child)]:rounded-none">
            <Button
              asChild
              aria-label={t("navigation.viewDay")}
              size="icon"
              variant={view === "day" ? "default" : "outline"}
              className="twcal:rounded-r-none twcal:[&_svg]:size-5 twcal:p-2 twcal:cursor-pointer"
              onClick={() => {
                handleChangeView("day");
              }}
            >
              <List strokeWidth={1.8} />
            </Button>

            <Button
              asChild
              aria-label={t("navigation.viewWeek")}
              size="icon"
              variant={view === "week" ? "default" : "outline"}
              className="twcal:-ml-px twcal:rounded-none twcal:[&_svg]:size-5 twcal:p-2"
              onClick={() => {
                handleChangeView("week");
              }}
            >
              <Columns strokeWidth={1.8} />
            </Button>

            <Button
              asChild
              aria-label={t("navigation.viewMonth")}
              size="icon"
              variant={view === "month" ? "default" : "outline"}
              className="twcal:-ml-px twcal:rounded-none twcal:[&_svg]:size-5 twcal:p-2"
              onClick={() => {
                handleChangeView("month");
              }}
            >
              <Grid2x2 strokeWidth={1.8} />
            </Button>

            <Button
              asChild
              aria-label={t("navigation.viewYear")}
              size="icon"
              variant={view === "year" ? "default" : "outline"}
              className="twcal:-ml-px twcal:rounded-none twcal:[&_svg]:size-5 twcal:p-2"
              onClick={() => {
                handleChangeView("year");
              }}
            >
              <Grid3x3 strokeWidth={1.8} />
            </Button>

            <Button
              asChild
              aria-label={t("navigation.viewAgenda")}
              size="icon"
              variant={view === "agenda" ? "default" : "outline"}
              className="twcal:-ml-px twcal:rounded-l-none twcal:[&_svg]:size-5 twcal:p-2"
              onClick={() => {
                handleChangeView("agenda");
              }}
            >
              <CalendarRange strokeWidth={1.8} />
            </Button>
          </div>

          <UserSelect />
        </div>

        {!hideEdit && (
          <AddEventDialog hideEdit={hideEdit}>
            <Button className="twcal:w-full twcal:sm:w-auto">
              <Plus />
              {t("navigation.addEvent")}
            </Button>
          </AddEventDialog>
        )}
      </div>
    </div>
  );
}
