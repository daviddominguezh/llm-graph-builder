import { fetchFromBackend, uploadToBackend } from './backendProxy';

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

interface ImageUrlResponse {
  url: string;
}

function isImageUrlResponse(val: unknown): val is ImageUrlResponse {
  return typeof val === 'object' && val !== null && 'url' in val;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

/* ------------------------------------------------------------------ */
/*  Storage via backend proxy                                          */
/* ------------------------------------------------------------------ */

export async function uploadMcpImage(
  libraryItemId: string,
  file: File
): Promise<{ result: string | null; error: string | null }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const path = `/mcp-library/${encodeURIComponent(libraryItemId)}/image`;
    const data = await uploadToBackend(path, formData);
    if (!isImageUrlResponse(data)) return { result: null, error: 'Invalid response' };
    return { result: data.url, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function removeMcpImage(libraryItemId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/mcp-library/${encodeURIComponent(libraryItemId)}/image`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
