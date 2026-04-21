import { createRoot } from 'react-dom/client';

import './styles/tailwind.css';
import { ChatApp } from './app/ChatApp.js';

const el = document.getElementById('root');
if (el) createRoot(el).render(<ChatApp />);
