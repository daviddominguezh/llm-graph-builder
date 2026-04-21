'use server';

import { fetchFromBackend } from '@/app/lib/backendProxy';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { revalidatePath } from 'next/cache';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function revalidateOrgLayout(): void {
  revalidatePath('/orgs/[slug]', 'layout');
}

/* ------------------------------------------------------------------ */
/*  Server actions                                                     */
/* ------------------------------------------------------------------ */

export async function updateVisibilityAction(
  agentId: string,
  isPublic: boolean
): Promise<{ error: string | null }> {
  serverLog('[updateVisibilityAction] agentId:', agentId, 'isPublic:', isPublic);
  try {
    const path = `/agents/${encodeURIComponent(agentId)}/visibility`;
    await fetchFromBackend('PATCH', path, { isPublic });
    revalidateOrgLayout();
    return { error: null };
  } catch (err) {
    const message = extractError(err);
    serverError('[updateVisibilityAction] error:', message);
    return { error: message };
  }
}

export async function updateCategoryAction(
  agentId: string,
  category: string
): Promise<{ error: string | null }> {
  serverLog('[updateCategoryAction] agentId:', agentId, 'category:', category);
  try {
    const path = `/agents/${encodeURIComponent(agentId)}/category`;
    await fetchFromBackend('PATCH', path, { category });
    revalidateOrgLayout();
    return { error: null };
  } catch (err) {
    const message = extractError(err);
    serverError('[updateCategoryAction] error:', message);
    return { error: message };
  }
}

export async function updateDescriptionAction(
  agentId: string,
  description: string
): Promise<{ error: string | null }> {
  serverLog('[updateDescriptionAction] agentId:', agentId, 'description:', description);
  try {
    const path = `/agents/${encodeURIComponent(agentId)}/description`;
    await fetchFromBackend('PATCH', path, { description });
    revalidateOrgLayout();
    return { error: null };
  } catch (err) {
    const message = extractError(err);
    serverError('[updateDescriptionAction] error:', message);
    return { error: message };
  }
}
