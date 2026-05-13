import { createReadSignedUrl } from './gcs.js';

const GCS_URI_PREFIX = 'gs://';
const { length: PREFIX_LENGTH } = GCS_URI_PREFIX;
const NOT_FOUND = -1;
const PAST_SLASH = 1;

export function isImageChunkContent(content: string): boolean {
  return content.startsWith(GCS_URI_PREFIX);
}

function objectPathFromGcsUri(uri: string): string | null {
  if (!isImageChunkContent(uri)) return null;
  const afterPrefix = uri.slice(PREFIX_LENGTH);
  const slash = afterPrefix.indexOf('/');
  if (slash === NOT_FOUND) return null;
  return afterPrefix.slice(slash + PAST_SLASH);
}

export async function resolveImageChunkContent(content: string): Promise<string> {
  const path = objectPathFromGcsUri(content);
  if (path === null) return content;
  return await createReadSignedUrl(path);
}

interface ChunkLike {
  content: string;
}

export async function resolveImageChunksContent<T extends ChunkLike>(
  rows: T[]
): Promise<Array<T & { is_image?: boolean }>> {
  return await Promise.all(
    rows.map(async (row) => {
      if (!isImageChunkContent(row.content)) return row;
      const signed = await resolveImageChunkContent(row.content);
      return { ...row, content: signed, is_image: true };
    })
  );
}
