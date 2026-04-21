import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ChatApp } from './app/ChatApp.js';
import './styles/tailwind.css';

const el = document.getElementById('root');
if (el !== null) {
  createRoot(el).render(
    <StrictMode>
      <ChatApp />
    </StrictMode>
  );
}
