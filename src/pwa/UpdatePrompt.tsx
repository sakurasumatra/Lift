import { useRegisterSW } from 'virtual:pwa-register/react';
import { UPDATE_CHECK_MS } from './config';

/**
 * "New version available — tap to reload". The new service worker waits until the user chooses to reload,
 * so a deploy never reloads the app mid-workout. An installed app can stay open for days, so it also checks
 * for updates hourly and whenever it comes back into view.
 */
export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => { if (navigator.onLine) registration.update().catch(() => { /* offline or server down */ }); };
      window.setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="update-prompt" role="alert">
      <span>New version available</span>
      <button className="btn small primary" onClick={() => updateServiceWorker(true)}>Tap to reload</button>
      <button className="icon-btn" aria-label="Later" onClick={() => setNeedRefresh(false)}>✕</button>
    </div>
  );
}
