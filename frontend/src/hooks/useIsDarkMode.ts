import { useSyncExternalStore } from 'react';
import { useSession } from '../context/AuthContext';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeToColorScheme(onChange: () => void) {
  const mq = window.matchMedia?.(DARK_QUERY);
  mq?.addEventListener('change', onChange);
  return () => mq?.removeEventListener('change', onChange);
}

function systemPrefersDark() {
  return window.matchMedia?.(DARK_QUERY).matches ?? false;
}

/** Whether the app is currently showing night mode, resolving "System" to the device setting. */
export function useIsDarkMode(): boolean {
  const { settings } = useSession();
  const prefersDark = useSyncExternalStore(subscribeToColorScheme, systemPrefersDark);
  return settings.theme === 'DARK' || (settings.theme === 'SYSTEM' && prefersDark);
}
