import { useEffect, useState } from 'react';

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Entrance progress for charts: eases from 0 to 1 once, when the component first mounts
 * (opening the page, refreshing, signing in), so values grow from zero to their real size.
 * Later data changes are not replayed. Returns 1 straight away if reduced motion is preferred.
 */
export function useEntranceProgress(durationMs = 900): number {
  const [progress, setProgress] = useState(() => (prefersReducedMotion() ? 1 : 0));

  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
      setProgress(1);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // A frame's timestamp can fall slightly before `start`; never go below zero.
      const linear = Math.min(1, Math.max(0, (now - start) / durationMs));
      setProgress(easeOutCubic(linear));
      if (linear < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs]);

  return progress;
}
