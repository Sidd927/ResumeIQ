import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { wakeBackend } from './api/api';
import App from './App.tsx';

// Start waking a sleeping backend immediately (skipped in mock mode).
if (import.meta.env.VITE_USE_MOCK !== 'true') wakeBackend();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
