export interface ClientRegistration {
  client_id: string;
  client_secret?: string;
  token_endpoint_auth_method?: string;
  [key: string]: unknown;
}

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

  return (await res.json()) as ClientRegistration;
}
