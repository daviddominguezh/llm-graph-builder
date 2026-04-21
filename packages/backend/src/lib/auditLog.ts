import { serviceSupabase } from '../db/client.js';
import type { SupabaseClient } from '../db/queries/operationHelpers.js';

export type AuditEvent =
  | 'phone_verified'
  | 'phone_send_otp'
  | 'phone_check'
  | 'otp_verify_failed'
  | 'otp_lockout'
  | 'onboarding_completed'
  | 'oauth_duplicate_rejected'
  | 'google_linked'
  | 'google_unlinked'
  | 'lookup_email'
  | 'lookup_rate_limited';

interface AuditEntry {
  event: AuditEvent;
  userId?: string;
  email?: string;
  phone?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

const IPV4_PARTS = 4;
const IPV6_TRAILING_SEGMENTS = 5;
const IPV4_OCTET_A = 0;
const IPV4_OCTET_B = 1;
const IPV4_OCTET_C = 2;

function truncateIpv4(parts: string[]): string {
  if (parts.length !== IPV4_PARTS) return parts.join('.');
  return `${parts[IPV4_OCTET_A]}.${parts[IPV4_OCTET_B]}.${parts[IPV4_OCTET_C]}.0`;
}

function truncateIp(ip: string | undefined): string | undefined {
  if (ip === undefined) return undefined;
  if (ip.includes(':')) {
    return ip.replace(/(?::[^:]*){5}$/v, ':'.repeat(IPV6_TRAILING_SEGMENTS));
  }
  return truncateIpv4(ip.split('.'));
}

interface AuditRow {
  event: AuditEvent;
  user_id: string | null;
  email: string | null;
  phone: string | null;
  ip_truncated: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
}

function buildRow(entry: AuditEntry): AuditRow {
  return {
    event: entry.event,
    user_id: entry.userId ?? null,
    email: entry.email ?? null,
    phone: entry.phone ?? null,
    ip_truncated: truncateIp(entry.ip) ?? null,
    user_agent: entry.userAgent ?? null,
    metadata: entry.metadata ?? null,
  };
}

async function writeAuditRow(client: SupabaseClient, row: AuditRow): Promise<void> {
  await client.from('auth_audit_log').insert(row);
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  await writeAuditRow(serviceSupabase(), buildRow(entry));
}
