import { useEffect, useState } from 'react';

/**
 * Telling somebody their app is out of date.
 *
 * It never reloads by itself. Somebody halfway through picking a roster would lose the lot, and a
 * page that reloads under your thumb is worse than a stale one — so it offers, and they choose.
 *
 * Checked when the tab is looked at again rather than only on a timer, because that is exactly the
 * moment somebody comes back to it after a deploy.
 */

declare const __BUILD__: string;

const EVERY = 3 * 60 * 1000;

export function Version() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let stopped = false;

    async function check() {
      if (stopped || stale) return;
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        const { build } = (await response.json()) as { build: string };
        if (build && build !== __BUILD__) setStale(true);
      } catch {
        // Offline, or a deploy mid-flight. Nothing worth saying about it.
      }
    }

    const timer = setInterval(() => void check(), EVERY);
    const onFocus = () => void check();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    void check();

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [stale]);

  if (!stale) return null;

  return (
    <button className="freshen" onClick={() => window.location.reload()}>
      A newer version is out — tap to update
    </button>
  );
}
