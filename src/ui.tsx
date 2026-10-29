import { useEffect, useState } from 'react';
import type { ToastKind } from './lib/notify';

export function Title({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <header className="title">
      <div>
        <p className="kicker">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <span>{text}</span>
    </header>
  );
}

/** Bottom-of-screen "Saved ✓" / error message. Mounted once in the app layout. */
export function Toaster() {
  const [t, setT] = useState<{ msg: string; kind: ToastKind; id: number } | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ msg: string; kind: ToastKind }>).detail;
      setT({ ...d, id: Date.now() });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setT(null), d.kind === 'error' ? 7000 : 2200);
    };
    window.addEventListener('daymark-toast', on);
    return () => { window.removeEventListener('daymark-toast', on); window.clearTimeout(timer); };
  }, []);
  if (!t) return null;
  return (
    <div className={`toast ${t.kind}`} role="status" aria-live="polite" key={t.id}>
      <span>{t.kind === 'ok' ? '✓' : '⚠'}</span>
      <b>{t.msg}</b>
      <button onClick={() => setT(null)} aria-label="Dismiss">✕</button>
    </div>
  );
}
