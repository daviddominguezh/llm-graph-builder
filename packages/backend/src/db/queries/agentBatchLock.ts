/**
 * Per-agent async mutex for graph operation batches.
 *
 * Two batches for the same agent must never interleave: each batch snapshots
 * the graph before applying and rolls back to that snapshot on failure, so a
 * concurrent batch (second tab, publish racing autosave, overlapping
 * requests) would either interleave row writes or have its committed work
 * erased by the other batch's rollback. Serializing per agent removes both
 * hazards within this process.
 */

const agentLocks = new Map<string, Promise<void>>();

export async function withAgentLock<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
  const prev = agentLocks.get(agentId) ?? Promise.resolve();
  const run = prev.then(fn);
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  agentLocks.set(agentId, tail);
  void tail.then(() => {
    if (agentLocks.get(agentId) === tail) {
      agentLocks.delete(agentId);
    }
  });
  return run;
}
