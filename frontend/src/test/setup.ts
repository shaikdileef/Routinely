import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// The dashboard renders a lot (charts, daily tasks, Spotify); give findBy/waitFor room on a
// busy machine so tests fail on wrong behaviour, not on a slow first render.
configure({ asyncUtilTimeout: 3000 });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}
