import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { preloadSounds } from './sound';

// Browsers only allow audio after a user gesture: decode the samples on the first one.
window.addEventListener('pointerdown', preloadSounds, { once: true });
window.addEventListener('keydown', preloadSounds, { once: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
