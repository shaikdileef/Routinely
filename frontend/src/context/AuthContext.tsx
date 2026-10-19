import type {
  ColorTheme,
  LoginInput,
  RegisterInput,
  Session,
  Theme,
  UserImageKind,
  UserSettings,
} from '@planner/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { ApiError, UNAUTHORIZED_EVENT } from '../api/client';
import { authApi, settingsApi } from '../api/endpoints';

interface AuthApi {
  session: Session | null;
  loading: boolean;
  error: unknown;
  retry: () => void;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  setUserName: (name: string) => Promise<void>;
  /** Uploads the profile photo, or removes it when `file` is null. */
  setUserImage: (kind: UserImageKind, file: File | null) => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);
const SESSION_KEY = ['session'] as const;
const THEME_STORAGE_KEY = 'planner.theme';

/** Applies a theme preference to <html>; stored locally only to avoid a flash on next load. */
export function applyTheme(theme: Theme) {
  const dark =
    theme === 'DARK' ||
    (theme === 'SYSTEM' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage unavailable; theme still applies for this session
  }
}

const COLOR_THEME_STORAGE_KEY = 'planner.colorTheme';

/** Applies a colour theme to <html> (see styles/palettes.css); cached locally to avoid a flash. */
export function applyColorTheme(colorTheme: ColorTheme) {
  document.documentElement.dataset.palette = colorTheme.toLowerCase();
  try {
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, colorTheme);
  } catch {
    // storage unavailable; the theme still applies for this session
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: 1,
    staleTime: Infinity,
  });
  const session = sessionQuery.data ?? null;

  const setSession = useCallback((s: Session | null) => qc.setQueryData(SESSION_KEY, s), [qc]);

  useEffect(() => {
    const onUnauthorized = () => {
      if (qc.getQueryData(SESSION_KEY)) {
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
        setSession(null);
      }
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [qc, setSession]);

  const colorTheme = session?.settings.colorTheme;
  useEffect(() => {
    if (colorTheme) applyColorTheme(colorTheme);
  }, [colorTheme]);

  const theme = session?.settings.theme;
  useEffect(() => {
    if (!theme) return;
    applyTheme(theme);
    if (theme !== 'SYSTEM') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('SYSTEM');
    mq?.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, [theme]);

  const api = useMemo<AuthApi>(
    () => ({
      session,
      loading: sessionQuery.isPending,
      error: sessionQuery.error,
      retry: () => void sessionQuery.refetch(),
      login: async (input) => {
        const s = await authApi.login(input);
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
        setSession(s);
      },
      register: async (input) => {
        setSession(await authApi.register(input));
      },
      logout: async () => {
        await authApi.logout();
        qc.clear();
        setSession(null);
      },
      updateSettings: async (patch) => {
        const settings = await settingsApi.update(patch);
        if (session) setSession({ ...session, settings });
        // Timezone and week start change how dates are bucketed everywhere; theme changes don't.
        if ('timezone' in patch || 'weekStartsOn' in patch) {
          await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
        }
      },
      setUserName: async (name) => {
        const user = await authApi.updateProfile({ name });
        if (session) setSession({ ...session, user });
      },
      setUserImage: async (kind, file) => {
        const user = file ? await authApi.setImage(kind, file) : await authApi.removeImage(kind);
        if (session) setSession({ ...session, user });
      },
    }),
    [session, sessionQuery, qc, setSession],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Session for components rendered behind <RequireAuth>. */
export function useSession(): Session {
  const { session } = useAuth();
  if (!session) throw new Error('useSession used outside an authenticated route');
  return session;
}
