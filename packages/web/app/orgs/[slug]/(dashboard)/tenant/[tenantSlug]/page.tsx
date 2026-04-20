import { redirect } from 'next/navigation';

import { getOrgBySlug, getOrgRole } from '@/app/lib/orgs';
import { getTenantBySlug } from '@/app/lib/tenants';
import type { WhatsAppTemplate } from '@/app/lib/whatsappTemplates';
import {
  listTemplatesByTenant,
  listWhatsAppConnectionsByTenant,
} from '@/app/lib/whatsappTemplates';
import { Separator } from '@/components/ui/separator';

import { TenantSettingsForm } from './TenantSettingsForm';
import { WhatsAppTemplatesSection } from './whatsapp-templates/WhatsAppTemplatesSection';

interface PageProps {
  params: Promise<{ slug: string; tenantSlug: string }>;
}

export const dynamic = 'force-dynamic';

function canManageTemplates(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

// TODO: remove once real templates exist in the DB — these are for visual review only.
function buildMockTemplates(tenantId: string): WhatsAppTemplate[] {
  const now = Date.now();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const iso = (ms: number): string => new Date(now - ms).toISOString();
  const connectionId = '00000000-0000-0000-0000-000000000000';

  return [
    {
      id: 'mock-1',
      tenant_id: tenantId,
      channel_connection_id: connectionId,
      meta_template_id: '1234567890123456',
      name: 'order_confirmation',
      body: 'Hi {{1}}, your order #{{2}} has been confirmed. We’ll let you know when it ships.',
      language: 'en',
      variables: [
        { key: '1', name: 'customer_name', example: 'Maya', required: true },
        { key: '2', name: 'order_number', example: 'A-18234', required: true },
      ],
      category: 'utility',
      description: null,
      status: 'approved',
      created_at: iso(5 * day),
      updated_at: iso(5 * day),
    },
    {
      id: 'mock-2',
      tenant_id: tenantId,
      channel_connection_id: connectionId,
      meta_template_id: null,
      name: 'delivery_update',
      body: 'Hey {{1}}, package {{2}} is out for delivery — ETA {{3}}.',
      language: 'en',
      variables: [
        { key: '1', name: 'customer_name', example: 'Jon', required: true },
        { key: '2', name: 'package_id', example: 'PKG-9921', required: true },
        { key: '3', name: 'eta', example: '6:30 PM', required: true },
      ],
      category: 'utility',
      description: null,
      status: 'pending',
      created_at: iso(12 * minute),
      updated_at: iso(12 * minute),
    },
    {
      id: 'mock-3',
      tenant_id: tenantId,
      channel_connection_id: connectionId,
      meta_template_id: null,
      name: 'appointment_reminder',
      body: 'Reminder: appointment on {{1}} at {{2}}. Reply CANCEL to reschedule.',
      language: 'en',
      variables: [
        { key: '1', name: 'date', example: 'Tue Apr 22', required: true },
        { key: '2', name: 'time', example: '10:00', required: true },
      ],
      category: 'utility',
      description: null,
      status: 'pending',
      created_at: iso(3 * day),
      updated_at: iso(3 * day),
    },
    {
      id: 'mock-4',
      tenant_id: tenantId,
      channel_connection_id: connectionId,
      meta_template_id: '9876543210987654',
      name: 'verification_code',
      body: 'Your verification code is {{1}}. It expires in 10 minutes.',
      language: 'en',
      variables: [{ key: '1', name: 'code', example: '482910', required: true }],
      category: 'authentication',
      description: null,
      status: 'approved',
      created_at: iso(21 * day),
      updated_at: iso(21 * day),
    },
    {
      id: 'mock-5',
      tenant_id: tenantId,
      channel_connection_id: connectionId,
      meta_template_id: '5555555555555555',
      name: 'spring_promo',
      body: 'Hi {{1}}! Spring sale: 20% off everything with code SPRING20. Ends Sunday.',
      language: 'en',
      variables: [{ key: '1', name: 'customer_name', example: 'Ana', required: true }],
      category: 'marketing',
      description: null,
      status: 'rejected',
      created_at: iso(8 * day),
      updated_at: iso(2 * day),
    },
    {
      id: 'mock-6',
      tenant_id: tenantId,
      channel_connection_id: connectionId,
      meta_template_id: '7777777777777777',
      name: 'welcome',
      body: 'Welcome aboard! Reply with HELP any time and we’ll jump in.',
      language: 'en',
      variables: [],
      category: 'utility',
      description: null,
      status: 'paused',
      created_at: iso(40 * day),
      updated_at: iso(6 * day),
    },
  ];
}

export default async function TenantPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { slug, tenantSlug } = await params;
  const { result: org } = await getOrgBySlug(slug);
  if (!org) redirect('/');

  const { result: tenant } = await getTenantBySlug(org.id, tenantSlug);
  if (!tenant) redirect(`/orgs/${slug}/tenants`);

  const [role, { connections }] = await Promise.all([
    getOrgRole(org.id),
    listWhatsAppConnectionsByTenant(tenant.id),
  ]);
  // TODO: switch back to `(await listTemplatesByTenant(tenant.id)).templates` once mock data is no longer needed.
  void listTemplatesByTenant;
  const templates = buildMockTemplates(tenant.id);

  const canManage = canManageTemplates(role);

  return (
    <div className="h-[calc(100%-var(--spacing)*1.5)] overflow-y-auto p-6 border rounded-xl mr-1.5 overflow-hidden">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <TenantSettingsForm tenant={tenant} orgSlug={slug} />
        <Separator />
        <WhatsAppTemplatesSection
          tenantId={tenant.id}
          orgSlug={slug}
          tenantSlug={tenantSlug}
          templates={templates}
          connections={connections}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
