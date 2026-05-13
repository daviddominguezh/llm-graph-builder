"use client";

import { parseISO } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";

import { useDisclosure } from "@cc/hooks/use-disclosure";
import { useCalendar } from "@cc/calendar/contexts/calendar-context";
import { useUpdateEvent } from "@cc/calendar/hooks/use-update-event";

import { Input } from "@cc/components/ui/input";
import { Button } from "@cc/components/ui/button";
import { Textarea } from "@cc/components/ui/textarea";
import { TimeInput } from "@cc/components/ui/time-input";
import { SingleDayPicker } from "@cc/components/ui/single-day-picker";
import { Avatar, AvatarFallback, AvatarImage } from "@cc/components/ui/avatar";
import { Form, FormField, FormLabel, FormItem, FormControl, FormMessage } from "@cc/components/ui/form";
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from "@cc/components/ui/select";
import { Dialog, DialogHeader, DialogClose, DialogContent, DialogTrigger, DialogTitle, DialogDescription, DialogFooter } from "@cc/components/ui/dialog";

import { eventSchema } from "@cc/calendar/schemas";

import type { IEvent } from "@cc/calendar/interfaces";
import type { TimeValue } from "react-aria-components";
import type { TEventFormData } from "@cc/calendar/schemas";

interface IProps {
  children: React.ReactNode;
  event: IEvent;
}

export function EditEventDialog({ children, event }: IProps) {
  const { isOpen, onClose, onToggle } = useDisclosure();
  const { t } = useTranslation();

  const { users } = useCalendar();

  const { updateEvent } = useUpdateEvent();

  const form = useForm<TEventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      user: event.user.id,
      title: event.title,
      description: event.description,
      startDate: parseISO(event.startDate),
      startTime: { hour: parseISO(event.startDate).getHours(), minute: parseISO(event.startDate).getMinutes() },
      endDate: parseISO(event.endDate),
      endTime: { hour: parseISO(event.endDate).getHours(), minute: parseISO(event.endDate).getMinutes() },
      color: event.color,
    },
  });

  const onSubmit = (values: TEventFormData) => {
    const user = users.find(user => user.id === values.user);

    if (!user) throw new Error("User not found");

    const startDateTime = new Date(values.startDate);
    startDateTime.setHours(values.startTime.hour, values.startTime.minute);

    const endDateTime = new Date(values.endDate);
    endDateTime.setHours(values.endTime.hour, values.endTime.minute);

    updateEvent({
      ...event,
      user,
      title: values.title,
      color: values.color,
      description: values.description,
      startDate: startDateTime.toISOString(),
      endDate: endDateTime.toISOString(),
    });

    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onToggle}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogs.editEvent.title")}</DialogTitle>
          <DialogDescription>
            {t("dialogs.editEvent.description")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form id="event-form" onSubmit={form.handleSubmit(onSubmit)} className="twcal:grid twcal:gap-4 twcal:py-4">
            <FormField
              control={form.control}
              name="user"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t("dialogs.common.responsible")}</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-invalid={fieldState.invalid}>
                        <SelectValue placeholder={t("placeholders.selectOption")} />
                      </SelectTrigger>

                      <SelectContent>
                        {users.map(user => (
                          <SelectItem key={user.id} value={user.id} className="twcal:flex-1">
                            <div className="twcal:flex twcal:items-center twcal:gap-2">
                              <Avatar key={user.id} className="twcal:size-6">
                                <AvatarImage src={user.picturePath ?? undefined} alt={user.name} />
                                <AvatarFallback className="twcal:text-xxs">{user.name[0]}</AvatarFallback>
                              </Avatar>

                              <p className="twcal:truncate">{user.name}</p>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel htmlFor="title">{t("dialogs.common.title")}</FormLabel>

                  <FormControl>
                    <Input id="title" placeholder={t("placeholders.enterTitle")} data-invalid={fieldState.invalid} {...field} />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="twcal:flex twcal:items-start twcal:gap-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field, fieldState }) => (
                  <FormItem className="twcal:flex-1">
                    <FormLabel htmlFor="startDate">{t("dialogs.common.startDate")}</FormLabel>

                    <FormControl>
                      <SingleDayPicker
                        id="startDate"
                        value={field.value}
                        onSelect={date => field.onChange(date as Date)}
                        placeholder={t("placeholders.selectDate")}
                        data-invalid={fieldState.invalid}
                      />
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startTime"
                render={({ field, fieldState }) => (
                  <FormItem className="twcal:flex-1">
                    <FormLabel>{t("dialogs.common.startTime")}</FormLabel>

                    <FormControl>
                      <TimeInput value={field.value as TimeValue} onChange={field.onChange} hourCycle={12} data-invalid={fieldState.invalid} />
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="twcal:flex twcal:items-start twcal:gap-2">
              <FormField
                control={form.control}
                name="endDate"
                render={({ field, fieldState }) => (
                  <FormItem className="twcal:flex-1">
                    <FormLabel>{t("dialogs.common.endDate")}</FormLabel>
                    <FormControl>
                      <SingleDayPicker
                        value={field.value}
                        onSelect={date => field.onChange(date as Date)}
                        placeholder={t("placeholders.selectDate")}
                        data-invalid={fieldState.invalid}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endTime"
                render={({ field, fieldState }) => (
                  <FormItem className="twcal:flex-1">
                    <FormLabel>{t("dialogs.common.endTime")}</FormLabel>
                    <FormControl>
                      <TimeInput value={field.value as TimeValue} onChange={field.onChange} hourCycle={12} data-invalid={fieldState.invalid} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="color"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t("dialogs.common.color")}</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-invalid={fieldState.invalid}>
                        <SelectValue placeholder={t("placeholders.selectOption")} />
                      </SelectTrigger>

                      <SelectContent>
                        <SelectItem value="blue">
                          <div className="twcal:flex twcal:items-center twcal:gap-2">
                            <div className="twcal:size-3.5 twcal:rounded-full twcal:bg-blue-600" />
                            {t("colors.blue")}
                          </div>
                        </SelectItem>

                        <SelectItem value="green">
                          <div className="twcal:flex twcal:items-center twcal:gap-2">
                            <div className="twcal:size-3.5 twcal:rounded-full twcal:bg-green-600" />
                            {t("colors.green")}
                          </div>
                        </SelectItem>

                        <SelectItem value="red">
                          <div className="twcal:flex twcal:items-center twcal:gap-2">
                            <div className="twcal:size-3.5 twcal:rounded-full twcal:bg-red-600" />
                            {t("colors.red")}
                          </div>
                        </SelectItem>

                        <SelectItem value="yellow">
                          <div className="twcal:flex twcal:items-center twcal:gap-2">
                            <div className="twcal:size-3.5 twcal:rounded-full twcal:bg-yellow-600" />
                            {t("colors.yellow")}
                          </div>
                        </SelectItem>

                        <SelectItem value="purple">
                          <div className="twcal:flex twcal:items-center twcal:gap-2">
                            <div className="twcal:size-3.5 twcal:rounded-full twcal:bg-purple-600" />
                            {t("colors.purple")}
                          </div>
                        </SelectItem>

                        <SelectItem value="orange">
                          <div className="twcal:flex twcal:items-center twcal:gap-2">
                            <div className="twcal:size-3.5 twcal:rounded-full twcal:bg-orange-600" />
                            {t("colors.orange")}
                          </div>
                        </SelectItem>

                        <SelectItem value="gray">
                          <div className="twcal:flex twcal:items-center twcal:gap-2">
                            <div className="twcal:size-3.5 twcal:rounded-full twcal:bg-neutral-600" />
                            {t("colors.gray")}
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t("dialogs.common.description")}</FormLabel>

                  <FormControl>
                    <Textarea {...field} value={field.value} data-invalid={fieldState.invalid} />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("dialogs.common.cancel")}
            </Button>
          </DialogClose>

          <Button form="event-form" type="submit">
            {t("dialogs.editEvent.saveButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
