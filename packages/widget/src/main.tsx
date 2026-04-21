import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/tailwind.css';
import { ChatApp } from './app/ChatApp.js';

const el = document.getElementById('root');
if (el !== null) {
  createRoot(el).render(
    <StrictMode><ChatApp /></StrictMode>
  );
}
