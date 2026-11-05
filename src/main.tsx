import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallbackTitle="Error en el entorno de ejecución de Kizuna-Zek">
    <App />
  </ErrorBoundary>
);

// Register PWA Service Worker for Android WebAPK shortcuts and homescreen widgets
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        console.warn('[PWA] Service worker registration note:', err);
      });
  });
}

