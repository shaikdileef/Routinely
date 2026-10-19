import {
  passwordChangeSchema,
  PRIORITIES,
  PRIORITY_LABELS,
  profileUpdateSchema,
  type Priority,
  type Theme,
  type UserSettings,
} from '@planner/shared';
import { Camera, Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../api/client';
import { authApi } from '../api/endpoints';
import { NotificationsCard } from '../components/settings/NotificationsCard';
import { SystemCheckCard } from '../components/settings/SystemCheckCard';
import { ThemeGallery } from '../components/settings/ThemeGallery';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { Field, FormError, formStyles, Select, TextInput } from '../components/ui/Form';
import { useAuth, useSession } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { IMAGE_ACCEPT, validateImageFile } from '../lib/images';
import styles from './Pages.module.css';

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'LIGHT', label: 'Light', icon: Sun },
  { value: 'DARK', label: 'Dark', icon: Moon },
  { value: 'SYSTEM', label: 'System', icon: Monitor },
];

function allTimeZones(current: string): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.('timeZone') ?? [];
  return zones.includes(current) ? zones : [current, ...zones];
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your profile and preferences" />
      <div className={styles.stack} style={{ maxWidth: 720 }}>
        <Card title="Themes">
          <ThemeGallery />
        </Card>
        <PreferencesCard />
        <NotificationsCard />
        <SystemCheckCard />
        <ProfileCard />
        <PasswordCard />
      </div>
    </>
  );
}

function PreferencesCard() {
  const { settings } = useSession();
  const { updateSettings } = useAuth();
  const toast = useToast();
  const [draft, setDraft] = useState<UserSettings>(settings);
  const [saving, setSaving] = useState(false);

  // Keep the theme choice in step with the top-bar day/night toggle.
  useEffect(() => setDraft((d) => ({ ...d, theme: settings.theme })), [settings.theme]);
  // …and with the theme gallery.
  useEffect(
    () => setDraft((d) => ({ ...d, colorTheme: settings.colorTheme })),
    [settings.colorTheme],
  );
  const [error, setError] = useState<string | null>(null);
  const zones = useMemo(() => allTimeZones(settings.timezone), [settings.timezone]);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateSettings(draft);
      toast.success('Preferences saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Preferences">
      <form className={formStyles.stack} onSubmit={onSubmit}>
        <FormError message={error} />
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend className={formStyles.label} style={{ marginBottom: 8 }}>
            Theme
          </legend>
          <div className={styles.segmented} role="group" aria-label="Theme">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={draft.theme === value}
                onClick={() => setDraft((d) => ({ ...d, theme: value }))}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Icon size={14} aria-hidden /> {label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className={formStyles.row}>
          <Field label="Week starts on">
            <Select
              value={draft.weekStartsOn}
              onChange={(e) =>
                setDraft((d) => ({ ...d, weekStartsOn: e.target.value === '0' ? 0 : 1 }))
              }
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </Select>
          </Field>
          <Field label="Default task priority">
            <Select
              value={draft.defaultPriority}
              onChange={(e) =>
                setDraft((d) => ({ ...d, defaultPriority: e.target.value as Priority }))
              }
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Timezone"
          hint={`Decides what "today" and "overdue" mean. Your device is set to ${browserZone}.`}
        >
          <Select
            value={draft.timezone}
            onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
            Save preferences
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ProfileCard() {
  const { user } = useSession();
  const { setUserName } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = profileUpdateSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setUserName(parsed.data.name);
      toast.success('Profile updated');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Profile">
      <ProfilePhoto />
      <form className={formStyles.stack} onSubmit={onSubmit} noValidate>
        <div className={formStyles.row}>
          <Field label="Name" error={error ?? undefined}>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="name"
            />
          </Field>
          <Field label="Email" hint="Email can't be changed">
            <TextInput value={user.email} readOnly disabled />
          </Field>
        </div>
        <div>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={name.trim() === user.name}
          >
            Save profile
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Profile photo: saved as soon as a file is chosen, shown in the header instead of initials. */
function ProfilePhoto() {
  const { user } = useSession();
  const { setUserImage } = useAuth();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(file: File | null) {
    if (busy) return;
    if (file) {
      const problem = validateImageFile(file);
      setError(problem);
      if (problem) return;
    }
    setBusy(file ? 'upload' : 'remove');
    setError(null);
    try {
      await setUserImage('avatar', file);
      toast.success(file ? 'Profile photo updated' : 'Profile photo removed');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={styles.photoRow}>
      <Avatar name={user.name} url={user.avatarUrl} size={72} />
      <div className={styles.photoBody}>
        <p className={styles.photoTitle}>Profile photo</p>
        <p className={`${styles.muted} ${styles.small}`}>PNG, JPEG, WebP or GIF, up to 5 MB.</p>
        <div className={styles.photoActions}>
          <Button
            size="sm"
            icon={<Camera size={15} />}
            loading={busy === 'upload'}
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {user.avatarUrl ? 'Change photo' : 'Upload photo'}
          </Button>
          {user.avatarUrl && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={15} />}
              loading={busy === 'remove'}
              disabled={busy !== null}
              onClick={() => save(null)}
            >
              Remove
            </Button>
          )}
        </div>
        {error && (
          <p className={styles.photoError} role="alert">
            {error}
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="visually-hidden"
        tabIndex={-1}
        aria-label="Choose a profile photo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void save(file);
        }}
      />
    </div>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = passwordChangeSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      await authApi.changePassword(parsed.data);
      setForm({ currentPassword: '', newPassword: '' });
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Change password">
      <form className={formStyles.stack} onSubmit={onSubmit} noValidate>
        <FormError message={formError} />
        <div className={formStyles.row}>
          <Field label="Current password" error={errors.currentPassword}>
            <TextInput
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
            />
          </Field>
          <Field label="New password" hint="At least 8 characters" error={errors.newPassword}>
            <TextInput
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
            />
          </Field>
        </div>
        <div>
          <Button type="submit" loading={saving}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}
