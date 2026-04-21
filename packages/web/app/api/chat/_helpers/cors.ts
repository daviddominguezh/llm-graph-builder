import { AGENT_SLUG_REGEX, TENANT_SLUG_REGEX } from '@openflow/shared-validation';

// Strip anchors from shared sources to compose them into a URL-shape regex.
const T_BODY = TENANT_SLUG_REGEX.source.replace(/^\^|\$$/g, '');
const A_BODY = AGENT_SLUG_REGEX.source.replace(/^\^|\$$/g, '');
const WIDGET_ORIGIN_REGEX = new RegExp(
  `^https://(?:${T_BODY})-(?:${A_BODY})\\.live\\.openflow\\.build$`
);

const DEV_ORIGIN = 'http://localhost:5173';

function isAllowed(origin: string): boolean {
  if (WIDGET_ORIGIN_REGEX.test(origin)) return true;
  return process.env['NODE_ENV'] !== 'production' && origin === DEV_ORIGIN;
}

export function corsHeadersFor(origin: string | null): Record<string, string> {
  if (origin === null || !isAllowed(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
  };
}

export function preflightResponse(request: Request): Response {
  const origin = request.headers.get('origin');
  return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
}
