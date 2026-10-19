import { loginSchema, registerSchema } from '@planner/shared';
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ApiError, errorMessage } from '../api/client';
import { Button } from '../components/ui/Button';
import { Field, FormError, formStyles, TextInput } from '../components/ui/Form';
import { LogoMark } from '../components/ui/Logo';
import { useAuth } from '../context/AuthContext';
import styles from './AuthPages.module.css';

function issuesToErrors(issues: { path: (string | number)[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0])] ??= i.message;
  return out;
}

function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden>
            <LogoMark size={22} />
          </span>
          <span className={styles.brandName}>Routinely</span>
        </div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
        {children}
        <p className={styles.footer}>{footer}</p>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await login(parsed.data);
    } catch (err) {
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to plan your day."
      footer={
        <>
          New here? <Link to="/register">Create an account</Link>
        </>
      }
    >
      <form className={formStyles.stack} onSubmit={onSubmit} noValidate>
        <FormError message={formError} />
        <Field label="Email" error={errors.email}>
          <TextInput
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Password" error={errors.password}>
          <TextInput
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" loading={busy} className={styles.submit}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parsed = registerSchema.safeParse({ ...form, timezone });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await register(parsed.data);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Organize tasks, track habits, and build momentum."
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form className={formStyles.stack} onSubmit={onSubmit} noValidate>
        <FormError message={formError} />
        <Field label="Name" error={errors.name}>
          <TextInput autoComplete="name" value={form.name} onChange={set('name')} autoFocus />
        </Field>
        <Field label="Email" error={errors.email}>
          <TextInput type="email" autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Password" hint="At least 8 characters" error={errors.password}>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
          />
        </Field>
        <Button type="submit" variant="primary" loading={busy} className={styles.submit}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
