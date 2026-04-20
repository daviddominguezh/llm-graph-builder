import { fetchFromBackend } from './backendProxy';

export interface WhatsAppTemplateVariable {
  key: string;
  name: string;
  example: string;
  required: boolean;
}

export type WhatsAppTemplateCategory = 'utility' | 'marketing' | 'authentication';

export type WhatsAppTemplateStatus = 'approved' | 'pending' | 'rejected' | 'paused' | 'deactivated';

export interface WhatsAppTemplate {
  id: string;
  tenant_id: string;
  channel_connection_id: string;
  meta_template_id: string | null;
  name: string;
  body: string;
  language: string;
  variables: WhatsAppTemplateVariable[];
  category: WhatsAppTemplateCategory;
  description: string | null;
  status: WhatsAppTemplateStatus;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppChannelConnection {
  id: string;
  agent_id: string;
  enabled: boolean;
  phone_number: string | null;
  waba_id: string | null;
}

export interface CreateTemplatePayload {
  channelConnectionId: string;
  name: string;
  body: string;
  language: string;
  variables: WhatsAppTemplateVariable[];
  category: WhatsAppTemplateCategory;
  description: string | null;
}

function templatesBasePath(tenantId: string): string {
  return `/tenants/${encodeURIComponent(tenantId)}/whatsapp-templates`;
}

function isTemplatesResponse(value: unknown): value is { templates: WhatsAppTemplate[] } {
  if (typeof value !== 'object' || value === null) return false;
  return Array.isArray((value as { templates?: unknown }).templates);
}

function isConnectionArray(value: unknown): value is { connections: WhatsAppChannelConnection[] } {
  if (typeof value !== 'object' || value === null) return false;
  return Array.isArray((value as { connections?: unknown }).connections);
}

function isTemplateResponse(value: unknown): value is { template: WhatsAppTemplate | null } {
  if (typeof value !== 'object' || value === null) return false;
  const { template } = value as { template?: unknown };
  if (template === null || template === undefined) return true;
  return typeof template === 'object';
}

export async function listTemplatesByTenant(
  tenantId: string
): Promise<{ templates: WhatsAppTemplate[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', templatesBasePath(tenantId));
    if (!isTemplatesResponse(data)) return { templates: [], error: 'Invalid response' };
    return { templates: data.templates, error: null };
  } catch (err) {
    return { templates: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function listWhatsAppConnectionsByTenant(
  tenantId: string
): Promise<{ connections: WhatsAppChannelConnection[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `${templatesBasePath(tenantId)}/connections`);
    if (!isConnectionArray(data)) return { connections: [], error: 'Invalid response' };
    return { connections: data.connections, error: null };
  } catch (err) {
    return { connections: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function createWhatsAppTemplate(
  tenantId: string,
  payload: CreateTemplatePayload
): Promise<{ template: WhatsAppTemplate | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', templatesBasePath(tenantId), payload);
    if (!isTemplateResponse(data)) return { template: null, error: 'Invalid response' };
    return { template: data.template, error: null };
  } catch (err) {
    return { template: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function deleteWhatsAppTemplate(
  tenantId: string,
  templateId: string
): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `${templatesBasePath(tenantId)}/${encodeURIComponent(templateId)}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
