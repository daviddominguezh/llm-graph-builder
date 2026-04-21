/** Type declarations for the Facebook SDK loaded dynamically via script tag. */

interface FBAuthResponse {
  code?: string;
  accessToken?: string;
  userID?: string;
  expiresIn?: number;
  signedRequest?: string;
}

interface FBLoginResponse {
  status: 'connected' | 'not_authorized' | 'unknown';
  authResponse: FBAuthResponse;
}

interface FBLoginOptions {
  config_id: string;
  auth_type: string;
  response_type: string;
  override_default_response_type: boolean;
  extras?: {
    sessionInfoVersion: number;
    featureType: string;
  };
}

interface FBInitParams {
  appId: string;
  autoLogAppEvents: boolean;
  xfbml: boolean;
  version: string;
}

interface FacebookSDK {
  init: (params: FBInitParams) => void;
  login: (callback: (response: FBLoginResponse) => void, options: FBLoginOptions) => void;
}

declare global {
  interface Window {
    FB: FacebookSDK;
    fbAsyncInit: () => void;
  }
}

export type { FBAuthResponse, FBLoginResponse, FBLoginOptions, FBInitParams, FacebookSDK };
