// DB-backed lead scoring over conversation metadata. Portable (supabase-js only).
// No RPC: read-merge-write the `metadata` jsonb (column exists since migration
// 20260416100000); RU1 introduces no migration. Mirrors edge
// `setLeadScoreOnConversation`. The read-merge-write is last-writer-wins under
// concurrency, which matches the ported edge behaviour — no locking is added.
import type { LeadScoringServices } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

function isMetadataRow(v: unknown): v is { metadata: Record<string, unknown> | null } {
  return typeof v === 'object' && v !== null && 'metadata' in v;
}

function currentMetadata(data: unknown): Record<string, unknown> {
  return isMetadataRow(data) && data.metadata !== null ? data.metadata : {};
}

async function readScore(supabase: SupabaseClient, conversationId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  if (error !== null) throw new Error(error.message);
  const { lead_score: raw } = currentMetadata(data);
  return typeof raw === 'number' ? raw : null;
}

async function writeScore(supabase: SupabaseClient, conversationId: string, score: number): Promise<void> {
  // Read-merge-write so we never clobber other metadata keys (e.g. forms).
  const { data, error: readErr } = await supabase
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  if (readErr !== null) throw new Error(readErr.message);
  const merged = { ...currentMetadata(data), lead_score: score };
  const { error: writeErr } = await supabase
    .from('conversations')
    .update({ metadata: merged })
    .eq('id', conversationId);
  if (writeErr !== null) throw new Error(writeErr.message);
}

export function makeLeadScoringDbService(
  supabase: SupabaseClient,
  conversationId: string
): LeadScoringServices {
  return {
    getLeadScore: async () => await readScore(supabase, conversationId),
    setLeadScore: async (score) => {
      await writeScore(supabase, conversationId, score);
    },
  };
}
