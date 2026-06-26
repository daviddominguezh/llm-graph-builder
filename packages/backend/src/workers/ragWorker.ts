import { createServiceClient } from '../db/queries/executionAuthQueries.js';
import { readRagConfig } from '../rag/config.js';
import { tickOnce } from '../rag/workerLoop.js';

const POLL_INTERVAL_MS = 5000;

function log(msg: string): void {
  process.stdout.write(`[ragWorker] ${msg}\n`);
}

let timer: NodeJS.Timeout | null = null;

async function runTick(supabase: ReturnType<typeof createServiceClient>): Promise<void> {
  try {
    await tickOnce(supabase);
  } catch (err) {
    log(`tick error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    timer = setTimeout(() => {
      void runTick(supabase);
    }, POLL_INTERVAL_MS);
  }
}

export function startRagWorker(): void {
  const { config } = readRagConfig();
  if (config === null) {
    log('disabled (no RAG config)');
    return;
  }
  const supabase = createServiceClient();
  log('started');
  void runTick(supabase);
}

export function stopRagWorker(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}
