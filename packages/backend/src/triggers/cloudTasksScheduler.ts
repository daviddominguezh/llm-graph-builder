import type { CancelInput, ScheduleInput, TriggerScheduler } from './scheduler.js';
import { taskNameFor } from './scheduler.js';

export interface CloudTasksConfig {
  projectId: string;
  location: string;
  queue: string;
  fireUrl: string;
  masterKey: string;
}

export interface CreateTaskRequest {
  parent: string;
  task: {
    name: string;
    scheduleTime: { seconds: number };
    httpRequest: {
      httpMethod: 'POST';
      url: string;
      headers: Record<string, string>;
      body: string;
    };
  };
}

export interface DeleteTaskRequest {
  name: string;
}

export interface TasksClientLike {
  queuePath: (p: string, l: string, q: string) => string;
  createTask: (req: CreateTaskRequest) => Promise<unknown>;
  deleteTask: (req: DeleteTaskRequest) => Promise<unknown>;
}

const GRPC_NOT_FOUND = 5;
const MS_PER_SECOND = 1000;

function errorCode(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const { code } = err as { code: unknown };
    return typeof code === 'number' ? code : undefined;
  }
  return undefined;
}

export function createCloudTasksScheduler(deps: {
  client: TasksClientLike;
  config: CloudTasksConfig;
}): TriggerScheduler {
  const { client, config } = deps;
  const queuePath = (): string => client.queuePath(config.projectId, config.location, config.queue);
  const fullName = (triggerId: string, epoch: number): string =>
    `${queuePath()}/tasks/${taskNameFor(triggerId, epoch)}`;

  return {
    async schedule(input: ScheduleInput): Promise<void> {
      const { payload } = input;
      await client.createTask({
        parent: queuePath(),
        task: {
          name: fullName(payload.triggerId, payload.hopEpoch),
          scheduleTime: { seconds: Math.floor(input.runAt.getTime() / MS_PER_SECOND) },
          httpRequest: {
            httpMethod: 'POST',
            url: config.fireUrl,
            headers: { 'Content-Type': 'application/json', 'x-master-key': config.masterKey },
            body: Buffer.from(JSON.stringify(payload)).toString('base64'),
          },
        },
      });
    },
    async cancel(input: CancelInput): Promise<void> {
      try {
        await client.deleteTask({ name: fullName(input.triggerId, input.taskEpoch) });
      } catch (err) {
        if (errorCode(err) === GRPC_NOT_FOUND) return;
        throw err;
      }
    },
  };
}
