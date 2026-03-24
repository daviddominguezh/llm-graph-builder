import { fetchFromBackend, uploadToBackend } from './backendProxy';
import type { BrowseOptions, McpLibraryRow, PublishInput } from './mcp-library-types';
import { isLibraryRow } from './mcp-library-types';

export type { McpLibraryRow } from './mcp-library-types';
export { isLibraryRow } from './mcp-library-types';

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isLibraryRowArray(val: unknown): val is McpLibraryRow[] {
  return Array.isArray(val);
}

interface ErrorResponse {
  error: string;
}

function isErrorResponse(val: unknown): val is ErrorResponse {
  return typeof val === 'object' && val !== null && 'error' in val;
}

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

function buildBrowseQuery(options?: BrowseOptions): string {
  const params = new URLSearchParams();
  if (options?.query) params.set('q', options.query);
  if (options?.category) params.set('category', options.category);
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  if (options?.offset !== undefined) params.set('offset', String(options.offset));
  const qs = params.toString();
  return qs === '' ? '/mcp-library' : `/mcp-library?${qs}`;
}

/* ------------------------------------------------------------------ */
/*  Queries via backend proxy                                          */
/* ------------------------------------------------------------------ */

export async function browseLibrary(
  options?: BrowseOptions
): Promise<{ result: McpLibraryRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', buildBrowseQuery(options));
    if (!isLibraryRowArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function getLibraryItemById(
  id: string
): Promise<{ result: McpLibraryRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/mcp-library/${encodeURIComponent(id)}`);
    if (!isLibraryRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function publishToLibrary(
  item: PublishInput
): Promise<{ result: McpLibraryRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', '/mcp-library', item);
    if (!isLibraryRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function unpublishFromLibrary(id: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/mcp-library/${encodeURIComponent(id)}`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

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

export async function incrementInstallations(libraryItemId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('POST', `/mcp-library/${encodeURIComponent(libraryItemId)}/install`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
