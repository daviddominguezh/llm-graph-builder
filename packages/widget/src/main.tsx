import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ChatApp } from './app/ChatApp.js';
import './styles/tailwind.css';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

const skipLocalhost = (event: BeforeSendEvent): BeforeSendEvent | null => {
  const { hostname } = new URL(event.url);
  if (LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost')) {
    return null;
  }
  return event;
};

const el = document.getElementById('root');
if (el !== null) {
  createRoot(el).render(
    <StrictMode>
      <ChatApp />
      <Analytics beforeSend={skipLocalhost} />
    </StrictMode>
  );
}
