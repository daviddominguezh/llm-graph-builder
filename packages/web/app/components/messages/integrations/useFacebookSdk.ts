'use client';

import { useEffect, useState } from 'react';

const FB_SDK_URL = 'https://connect.facebook.net/en_US/sdk.js';
const FB_SDK_VERSION = 'v23.0';

function isSdkLoaded(): boolean {
  return typeof window !== 'undefined' && typeof window.FB !== 'undefined';
}

/**
 * Dynamically loads the Facebook SDK and initialises it with the app ID
 * from the NEXT_PUBLIC_FB_APP_ID env var.
 *
 * Returns `true` once the SDK is ready to use.
 */
export function useFacebookSdk(): boolean {
  const [ready, setReady] = useState(isSdkLoaded);

  useEffect(() => {
    if (ready) return;

    const appId = process.env.NEXT_PUBLIC_FB_APP_ID;
    if (!appId) {
      console.error('[FB SDK] NEXT_PUBLIC_FB_APP_ID is not set');
      return;
    }

    const script = document.createElement('script');
    script.src = FB_SDK_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';

    script.onload = () => {
      window.fbAsyncInit = () => {
        window.FB.init({
          appId,
          autoLogAppEvents: true,
          xfbml: true,
          version: FB_SDK_VERSION,
        });
        setReady(true);
      };
      window.fbAsyncInit();
    };

    document.body.appendChild(script);
  }, [ready]);

  return ready;
}
