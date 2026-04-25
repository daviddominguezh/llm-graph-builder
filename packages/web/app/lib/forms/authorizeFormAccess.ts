import { createClient } from '@/app/lib/supabase/server';

export type AuthOutcome =
  | { ok: true; userId: string; formId: string }
  | { ok: false; status: 401 | 403 | 404; reason: string };

interface AgentRow {
  id: string;
  user_id: string;
}
interface TenantRow {
  id: string;
  org_id: string;
}
interface MembershipRow {
  user_id: string;
}
interface FormRow {
  id: string;
}

interface AuthArgs {
  agentId: string;
  formSlug: string;
  tenantId: string;
}

type DbClient = Awaited<ReturnType<typeof createClient>>;

export async function authorizeFormAccess(args: AuthArgs): Promise<AuthOutcome> {
  const db = await createClient();
  const session = await db.auth.getUser();
  const { user } = session.data;
  if (!user) return fail(401, 'unauthenticated');

  const agentCheck = await checkAgentOwnership(db, args.agentId, user.id);
  if (!agentCheck.ok) return agentCheck;

  const tenantCheck = await checkTenantMembership(db, args.tenantId, user.id);
  if (!tenantCheck.ok) return tenantCheck;

  const formCheck = await resolveForm(db, args.agentId, args.formSlug);
  if (!formCheck.ok) return formCheck;

  return { ok: true, userId: user.id, formId: formCheck.formId };
}

async function checkAgentOwnership(
  db: DbClient,
  agentId: string,
  userId: string
): Promise<AuthOutcome | { ok: true }> {
  const { data } = await db.from('agents').select('id, user_id').eq('id', agentId).maybeSingle();
  const row = data as unknown as AgentRow | null;
  if (!row) return fail(404, 'agent-not-found');
  if (row.user_id !== userId) return fail(403, 'not-agent-owner');
  return { ok: true };
}

async function checkTenantMembership(
  db: DbClient,
  tenantId: string,
  userId: string
): Promise<AuthOutcome | { ok: true }> {
  const tenantResult = await db.from('tenants').select('id, org_id').eq('id', tenantId).maybeSingle();
  const tenant = tenantResult.data as unknown as TenantRow | null;
  if (!tenant) return fail(404, 'tenant-not-found');

  const memberResult = await db
    .from('org_members')
    .select('user_id')
    .eq('org_id', tenant.org_id)
    .eq('user_id', userId)
    .maybeSingle();
  const membership = memberResult.data as unknown as MembershipRow | null;
  if (!membership) return fail(403, 'not-org-member');
  return { ok: true };
}

async function resolveForm(
  db: DbClient,
  agentId: string,
  formSlug: string
): Promise<{ ok: true; formId: string } | AuthOutcome> {
  const { data } = await db
    .from('graph_forms')
    .select('id')
    .eq('agent_id', agentId)
    .eq('form_slug', formSlug)
    .maybeSingle();
  const form = data as unknown as FormRow | null;
  if (!form) return fail(404, 'form-not-found');
  return { ok: true, formId: form.id };
}

function fail(status: 401 | 403 | 404, reason: string): Extract<AuthOutcome, { ok: false }> {
  return { ok: false, status, reason };
}
