import i18n from '@cc/i18n';
import { z } from 'zod';

const getValidationMessage = (key: string) => i18n.t(key);

export const eventSchema = z.object({
  user: z.string(),
  title: z.string().min(1, { message: getValidationMessage('validation.titleRequired') }),
  description: z.string().min(1, { message: getValidationMessage('validation.descriptionRequired') }),
  startDate: z.date({ error: getValidationMessage('validation.startDateRequired') }),
  startTime: z.object(
    { hour: z.number(), minute: z.number() },
    { error: getValidationMessage('validation.startTimeRequired') }
  ),
  endDate: z.date({ error: getValidationMessage('validation.endDateRequired') }),
  endTime: z.object(
    { hour: z.number(), minute: z.number() },
    { error: getValidationMessage('validation.endTimeRequired') }
  ),
  color: z.enum(['blue', 'green', 'red', 'yellow', 'purple', 'orange', 'gray'], {
    error: getValidationMessage('validation.colorRequired'),
  }),
});

export type TEventFormData = z.infer<typeof eventSchema>;
