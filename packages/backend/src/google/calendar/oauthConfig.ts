import { getRequiredEnv } from '../../routes/oauth/oauthHelpers.js';

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export function loadGoogleOAuthConfig(): GoogleOAuthConfig {
  return {
    clientId: getRequiredEnv('GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: getRequiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
    callbackUrl: getRequiredEnv('GOOGLE_OAUTH_CALLBACK_URL'),
  };
}
