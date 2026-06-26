"use client";

import { parseISO } from "date-fns";
import { Calendar, Clock, Text, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDateFormatting } from "@cc/lib/date-utils";

import { Button } from "@cc/components/ui/button";
import { EditEventDialog } from "@cc/calendar/components/dialogs/edit-event-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cc/components/ui/dialog";

import type { IEvent } from "@cc/calendar/interfaces";

interface IProps {
  event: IEvent;
  hideEdit: boolean;
  children: React.ReactNode;
}

export function EventDetailsDialog({ event, hideEdit, children }: IProps) {
  const { t } = useTranslation();
  const { formatDate } = useDateFormatting();
  const startDate = parseISO(event.startDate);
  const endDate = parseISO(event.endDate);

  return (
    <>
      <Dialog>
        <DialogTrigger asChild>{children}</DialogTrigger>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>{event.title}</DialogTitle>
          </DialogHeader>

          <div className="twcal:space-y-4">
            <div className="twcal:flex twcal:items-start twcal:gap-2">
              <User className="twcal:mt-1 twcal:size-4 twcal:shrink-0" />
              <div>
                <p className="twcal:text-sm twcal:font-medium">{t("dialogs.common.responsible")}</p>
                <p className="twcal:text-sm twcal:text-muted-foreground">
                  {event.user.name}
                </p>
              </div>
            </div>

            <div className="twcal:flex twcal:items-start twcal:gap-2">
              <Calendar className="twcal:mt-1 twcal:size-4 twcal:shrink-0" />
              <div>
                <p className="twcal:text-sm twcal:font-medium">{t("dialogs.common.startDate")}</p>
                <p className="twcal:text-sm twcal:text-muted-foreground">
                  {formatDate(startDate, "MMM d, yyyy h:mm a")}
                </p>
              </div>
            </div>

            <div className="twcal:flex twcal:items-start twcal:gap-2">
              <Clock className="twcal:mt-1 twcal:size-4 twcal:shrink-0" />
              <div>
                <p className="twcal:text-sm twcal:font-medium">{t("dialogs.common.endDate")}</p>
                <p className="twcal:text-sm twcal:text-muted-foreground">
                  {formatDate(endDate, "MMM d, yyyy h:mm a")}
                </p>
              </div>
            </div>

            <div className="twcal:flex twcal:items-start twcal:gap-2">
              <Text className="twcal:mt-1 twcal:size-4 twcal:shrink-0" />
              <div>
                <p className="twcal:text-sm twcal:font-medium">{t("dialogs.common.description")}</p>
                <p className="twcal:text-sm twcal:text-muted-foreground">
                  {event.description}
                </p>
              </div>
            </div>
          </div>

          {!hideEdit && (
            <DialogFooter>
              <EditEventDialog event={event}>
                <Button type="button" variant="outline">
                  {t("dialogs.eventDetails.editButton")}
                </Button>
              </EditEventDialog>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
