import { createClient } from '@/app/lib/supabase/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const WEB_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3101';

const MIN_LENGTH = 0;

function buildRedirectUrl(status: 'success' | 'error'): string {
  return `${WEB_URL}?github_oauth=${status}`;
}

function getStringParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);
  return value !== null && value.length > MIN_LENGTH ? value : undefined;
}

interface CallbackParams {
  installationId: string;
  state: string;
}

function extractParams(url: URL): CallbackParams | null {
  const installationId = getStringParam(url, 'installation_id');
  const state = getStringParam(url, 'state');
  if (installationId === undefined || state === undefined) return null;
  return { installationId, state };
}

interface StatePayload {
  orgId: string;
  userId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStatePayload(value: unknown): value is StatePayload {
  if (!isRecord(value)) return false;
  return typeof value.orgId === 'string' && typeof value.userId === 'string';
}

function decodeStatePayload(state: string): StatePayload | null {
  const [, encoded] = state.split('.');
  if (typeof encoded !== 'string') return null;

  try {
    const payloadJson = Buffer.from(encoded, 'base64url').toString();
    const payload: unknown = JSON.parse(payloadJson);
    if (isStatePayload(payload)) return payload;
    return null;
  } catch {
    return null;
  }
}

async function callBackendInstallation(
  installationId: string,
  orgId: string,
  authHeader: string,
  state: string
): Promise<boolean> {
  const res = await fetch(`${API_URL}/github/installations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({ installationId: Number(installationId), orgId, state }),
  });
  return res.ok;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params = extractParams(url);

  if (params === null) {
    return NextResponse.redirect(buildRedirectUrl('error'));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return NextResponse.redirect(buildRedirectUrl('error'));
  }

  const statePayload = decodeStatePayload(params.state);
  if (statePayload === null) {
    return NextResponse.redirect(buildRedirectUrl('error'));
  }

  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token ?? '';
  const authHeader = `Bearer ${accessToken}`;

  try {
    const success = await callBackendInstallation(
      params.installationId,
      statePayload.orgId,
      authHeader,
      params.state
    );
    return NextResponse.redirect(buildRedirectUrl(success ? 'success' : 'error'));
  } catch {
    return NextResponse.redirect(buildRedirectUrl('error'));
  }
}
