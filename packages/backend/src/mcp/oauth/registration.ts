import { z } from 'zod';

const ClientRegistrationSchema = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
  token_endpoint_auth_method: z.string().optional(),
});

export type ClientRegistration = z.infer<typeof ClientRegistrationSchema> & Record<string, unknown>;

export async function registerClient(
  registrationEndpoint: string,
  callbackUrl: string
): Promise<ClientRegistration> {
  const body = {
    redirect_uris: [callbackUrl],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  };

  const res = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dynamic client registration failed: ${String(res.status)} — ${text}`);
  }

  const raw: unknown = await res.json();
  return ClientRegistrationSchema.loose().parse(raw);
}
