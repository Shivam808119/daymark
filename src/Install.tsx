import { useEffect, useState } from 'react';

type PromptEvent = Event & { prompt: () => Promise<void> };

/** "Install on your phone" card: uses the browser install prompt when available. */
export function InstallCard() {
  const [ev, setEv] = useState<PromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => !!window.matchMedia?.('(display-mode: standalone)').matches);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEv(e as PromptEvent); };
    const done = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', on);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done); };
  }, []);
  return (
    <article className="setting col">
      <div>
        <h3>Install on your phone</h3>
        <p>{installed ? 'Daymark is installed on this device. 🎉' : 'Open Daymark from your home screen like a normal app, full screen and fast.'}</p>
        {!installed && <p style={{ marginTop: 6 }}>Android Chrome: menu ⋮ → <b>Install app</b>. iPhone Safari: Share → <b>Add to Home Screen</b>.</p>}
      </div>
      {!installed && ev && <button className="btn" onClick={() => void ev.prompt()}>Install Daymark</button>}
    </article>
  );
}
