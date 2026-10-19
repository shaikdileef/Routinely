/**
 * "Symbiote" theme transition: the new theme oozes out of the clicked button as an organic
 * blob with tendrils reaching ahead of it, until it swallows the whole screen.
 *
 * Built on the View Transitions API: the browser snapshots the old page, the theme is
 * switched, and the live new page is revealed through an animated polygon clip-path.
 * Falls back to an instant switch when the API is missing or reduced motion is preferred.
 */

const DURATION_MS = 1100;
const POINTS = 260;
const FRAMES = 24;
const TENDRILS = 9;

interface Tendril {
  angle: number;
  width: number;
  reach: number;
  /** When this tendril peaks (0–1); staggered so they don't all lunge at once. */
  peak: number;
  /** Sideways drift over time, so tendrils curl instead of shooting out straight. */
  curl: number;
  curlPhase: number;
}

interface Wobble {
  frequency: number;
  phase: number;
  speed: number;
}

function angularDistance(a: number, b: number) {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** Builds clip-path keyframes for a blob that grows from (x, y) until it covers the viewport. */
function symbioteKeyframes(x: number, y: number): Keyframe[] {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cover = Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) * 1.08;

  const tendrils: Tendril[] = Array.from({ length: TENDRILS }, (_, i) => ({
    angle: (i / TENDRILS) * 2 * Math.PI + randomBetween(-0.3, 0.3),
    width: randomBetween(0.05, 0.14),
    reach: randomBetween(0.25, 0.55),
    peak: randomBetween(0.3, 0.6),
    curl: randomBetween(0.08, 0.2) * (Math.random() < 0.5 ? -1 : 1),
    curlPhase: randomBetween(0, 2 * Math.PI),
  }));
  const wobbles: Wobble[] = [3, 5, 8].map((frequency) => ({
    frequency,
    phase: randomBetween(0, 2 * Math.PI),
    speed: randomBetween(4, 9),
  }));

  return Array.from({ length: FRAMES + 1 }, (_, frame) => {
    const t = frame / FRAMES;
    // The body starts slowly and accelerates, so the tendrils visibly lead the way.
    const body = cover * Math.pow(t, 1.7);
    // Organic motion settles to a clean edge once the screen is covered.
    const settle = Math.sin(Math.PI * t);

    const points = Array.from({ length: POINTS }, (_, i) => {
      const angle = (i / POINTS) * 2 * Math.PI;

      let tendril = 0;
      for (const td of tendrils) {
        const heading = td.angle + td.curl * Math.sin(t * 7 + td.curlPhase);
        const falloff = Math.exp(-((angularDistance(angle, heading) / td.width) ** 2));
        const life = Math.max(0, Math.sin(Math.PI * Math.min(1, t / (td.peak * 2))));
        tendril += falloff * td.reach * life;
      }

      let wobble = 0;
      for (const wb of wobbles) {
        wobble += Math.sin(angle * wb.frequency + wb.phase + t * wb.speed) * 0.045;
      }

      const radius = Math.max(0, body + cover * settle * (tendril + wobble * t));
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      return `${px.toFixed(1)}px ${py.toFixed(1)}px`;
    });

    return { clipPath: `polygon(${points.join(', ')})` };
  });
}

/**
 * Runs `change` (which must switch the theme on <html>) behind the symbiote reveal,
 * starting from the centre of `origin`. If `change` rejects, the old theme stays.
 */
export async function runThemeTransition(origin: HTMLElement, change: () => Promise<void>) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reducedMotion) {
    await change();
    return;
  }

  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const root = document.documentElement;

  root.classList.add('theme-switching');
  const transition = document.startViewTransition(change);
  try {
    await transition.ready;
    root.animate(symbioteKeyframes(x, y), {
      duration: DURATION_MS,
      easing: 'linear',
      pseudoElement: '::view-transition-new(root)',
    });
    await transition.finished;
  } catch {
    // The view transition was skipped or `change` failed; surface the failure below.
  } finally {
    root.classList.remove('theme-switching');
  }
  await transition.updateCallbackDone;
}
