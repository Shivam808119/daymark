import { StrictMode } from 'react'; import { createRoot } from 'react-dom/client'; import './styles.css'; import { App } from './App';
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Lets Daymark be installed on a phone and open quickly. Only runs in the deployed site.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
