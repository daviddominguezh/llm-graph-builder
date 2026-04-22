'use client';

import { Analytics } from '@vercel/analytics/next';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

export function AnalyticsClient() {
  return (
    <Analytics
      beforeSend={(event) => {
        const { hostname } = new URL(event.url);
        if (LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost')) {
          return null;
        }
        return event;
      }}
    />
  );
}
