import type { McpLibraryRow } from '../../db/queries/mcpLibraryQueries.js';
import * as mcpLibraryQueries from '../../db/queries/mcpLibraryQueries.js';
import type { ServiceContext } from '../types.js';

export async function browseLibrary(
  ctx: ServiceContext,
  query?: string,
  category?: string,
  limit?: number,
  offset?: number
): Promise<McpLibraryRow[]> {
  const { result, error } = await mcpLibraryQueries.browseLibrary(ctx.supabase, {
    query,
    category,
    limit,
    offset,
  });
  if (error !== null) throw new Error(error);
  return result;
}

export async function getLibraryItem(ctx: ServiceContext, libraryItemId: string): Promise<McpLibraryRow> {
  const { result, error } = await mcpLibraryQueries.getLibraryItemById(ctx.supabase, libraryItemId);
  if (error !== null || result === null) {
    throw new Error(`Library item not found: ${libraryItemId}`);
  }
  return result;
}
