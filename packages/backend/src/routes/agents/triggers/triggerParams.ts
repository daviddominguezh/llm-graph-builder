import type { Request } from 'express';

import type { TriggerScheduler } from '../../../triggers/scheduler.js';

interface TriggerParams {
  triggerId?: string | string[];
}

export function getTriggerId(req: Request): string | undefined {
  const { triggerId }: TriggerParams = req.params;
  return typeof triggerId === 'string' ? triggerId : undefined;
}

/** Cancel the trigger's armed task (the hop recorded in armed_task_epoch). No-op
 *  when nothing is armed. */
export async function cancelArmedTask(
  scheduler: TriggerScheduler,
  triggerId: string,
  armedTaskEpoch: number | null
): Promise<void> {
  if (armedTaskEpoch === null) return;
  await scheduler.cancel({ triggerId, taskEpoch: armedTaskEpoch });
}
