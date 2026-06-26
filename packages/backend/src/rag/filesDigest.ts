import { createHash } from 'node:crypto';

interface DigestSource {
  id: string;
  updated_at: string;
}

/**
 * Stable digest of the (id, updated_at) pairs for a file set. Rows are
 * expected to be sorted by id ascending. Any add/delete/update bumps the
 * digest, so a stale client cache can be detected in one cheap round-trip.
 */
export function computeFilesDigest(rows: readonly DigestSource[]): string {
  const hash = createHash('sha256');
  for (const row of rows) {
    hash.update(`${row.id}:${row.updated_at}\n`);
  }
  return hash.digest('hex');
}
