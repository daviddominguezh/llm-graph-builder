import { createRoot } from 'react-dom/client';
import { ChatApp } from './app/ChatApp.js';

const el = document.getElementById('root');
if (el) createRoot(el).render(<ChatApp />);
