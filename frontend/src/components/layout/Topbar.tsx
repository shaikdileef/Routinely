import { ChevronDown, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../api/client';
import { applyTheme, useAuth, useSession } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';
import { runThemeTransition } from '../../lib/themeTransition';
import { Avatar } from '../ui/Avatar';
import { LogoMark } from '../ui/Logo';
import { IconButton } from '../ui/Button';
import { HeaderNav } from './HeaderNav';
import styles from './Topbar.module.css';

/** App header: brand and account actions on top, the page tabs underneath. */
export function Topbar() {
  return (
    <header className={styles.header}>
      <div className={styles.topbar}>
        <Link to="/" className={styles.brand} aria-label="Routinely home">
          <span className={styles.logo} aria-hidden>
            <LogoMark size={20} />
          </span>
          <span className={styles.brandName}>Routinely</span>
        </Link>
        <div className={styles.actions}>
          <ThemeToggle />
          <ProfileMenu />
        </div>
      </div>
      <HeaderNav />
    </header>
  );
}

/** Switches between day and night mode; the choice is saved to the user's settings. */
function ThemeToggle() {
  const { updateSettings } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isDark = useIsDarkMode();
  const label = isDark ? 'Switch to day mode' : 'Switch to night mode';

  async function onToggle() {
    if (saving || !buttonRef.current) return;
    const next = isDark ? 'LIGHT' : 'DARK';
    setSaving(true);
    try {
      // The theme is applied only after the server has saved it, inside the transition.
      await runThemeTransition(buttonRef.current, async () => {
        await updateSettings({ theme: next });
        applyTheme(next);
      });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <IconButton
      ref={buttonRef}
      label={label}
      onClick={onToggle}
      disabled={saving}
      aria-busy={saving || undefined}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
}

function ProfileMenu() {
  const { user } = useSession();
  const { logout } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function onLogout() {
    try {
      await logout();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className={styles.profile} ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.profileButton}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
      >
        <Avatar name={user.name} url={user.avatarUrl} />
        <ChevronDown size={14} aria-hidden className={styles.chevron} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuHeader}>
            <Avatar name={user.name} url={user.avatarUrl} size={36} />
            <div className={styles.menuIdentity}>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <Link
            to="/settings"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => setOpen(false)}
          >
            <Settings size={16} aria-hidden /> Settings
          </Link>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={onLogout}>
            <LogOut size={16} aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
