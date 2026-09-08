import { useEffect, useState } from 'react';

/**
 * A counter that ticks while football is happening, so a screen can refetch without being asked.
 *
 * Two rules keep it cheap. It only runs while something is actually in progress — a Tuesday needs
 * no heartbeat — and it never fires for a tab nobody is looking at, which matters because half the
 * league will leave this open on a phone for six hours on a Sunday.
 *
 * Coming back to a hidden tab fires immediately rather than waiting out the interval, because that
 * is the moment somebody wants to know what they missed.
 */
export function useHeartbeat(active: boolean, everyMs: number): number {
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (!active) return;
    const tick = () => setBeat((count) => count + 1);
    const timer = window.setInterval(() => {
      if (!document.hidden) tick();
    }, everyMs);
    const onReturn = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [active, everyMs]);

  return beat;
}
