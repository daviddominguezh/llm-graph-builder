import { CloudTasksClient } from '@google-cloud/tasks';
import type { protos } from '@google-cloud/tasks';

import type {
  CloudTasksConfig,
  CreateTaskRequest,
  DeleteTaskRequest,
  TasksClientLike,
} from './cloudTasksScheduler.js';
import { createCloudTasksScheduler } from './cloudTasksScheduler.js';
import { createLocalTimerScheduler } from './localTimerScheduler.js';
import type { TriggerScheduler } from './scheduler.js';

let memoized: TriggerScheduler | undefined = undefined;

function requireEnv(name: string): string {
  const { env } = process;
  const { [name]: value } = env;
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var ${name} for the trigger scheduler`);
  }
  return value;
}

function buildCloudTasksConfig(): CloudTasksConfig {
  return {
    projectId: requireEnv('GCP_PROJECT_ID'),
    location: requireEnv('CLOUD_TASKS_LOCATION'),
    queue: requireEnv('CLOUD_TASKS_QUEUE'),
    serviceAccount: requireEnv('CLOUD_TASKS_SERVICE_ACCOUNT'),
    fireUrl: requireEnv('TRIGGER_FIRE_URL'),
    masterKey: requireEnv('EDGE_FUNCTION_MASTER_KEY'),
  };
}

/**
 * Adapt the real CloudTasksClient (overloaded, proto-typed methods) to the
 * narrow TasksClientLike shape. The single cast lives here at the library
 * boundary so the adapter and tests stay fully typed.
 */
function toCreateTaskRequest(req: CreateTaskRequest): protos.google.cloud.tasks.v2.ICreateTaskRequest {
  return {
    parent: req.parent,
    task: {
      name: req.task.name,
      scheduleTime: req.task.scheduleTime,
      httpRequest: {
        httpMethod: req.task.httpRequest.httpMethod,
        url: req.task.httpRequest.url,
        headers: req.task.httpRequest.headers,
        body: req.task.httpRequest.body,
      },
    },
  };
}

function adaptCloudTasksClient(client: CloudTasksClient): TasksClientLike {
  return {
    queuePath: (p, l, q): string => client.queuePath(p, l, q),
    createTask: async (req: CreateTaskRequest): Promise<unknown> =>
      await client.createTask(toCreateTaskRequest(req)),
    deleteTask: async (req: DeleteTaskRequest): Promise<unknown> =>
      await client.deleteTask({ name: req.name }),
  };
}

function createScheduler(): TriggerScheduler {
  if (process.env.PRODUCTION === 'true') {
    const config = buildCloudTasksConfig();
    const client = adaptCloudTasksClient(new CloudTasksClient());
    return createCloudTasksScheduler({ client, config });
  }
  return createLocalTimerScheduler({
    fireUrl: requireEnv('TRIGGER_FIRE_URL'),
    masterKey: requireEnv('EDGE_FUNCTION_MASTER_KEY'),
  });
}

/** Memoized accessor that selects the adapter by the PRODUCTION env convention. */
export function getTriggerScheduler(): TriggerScheduler {
  memoized ??= createScheduler();
  return memoized;
}
