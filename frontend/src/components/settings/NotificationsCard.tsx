import { settingsUpdateSchema, type ChannelMode, type ReminderChannel } from '@planner/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, MessageCircle, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../../api/client';
import { settingsApi } from '../../api/endpoints';
import { useAuth, useSession } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useNotificationAvailability } from '../../hooks/queries';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Field, FormError, formStyles, TextInput } from '../ui/Form';
import { DeliveryLog } from './DeliveryLog';
import styles from './NotificationsCard.module.css';

interface Draft {
  notifyEmail: string;
  notifyPhone: string;
  emailReminders: boolean;
  whatsappReminders: boolean;
}

/** Where and how task reminders are delivered, with a test message per channel. */
export function NotificationsCard() {
  const { user, settings } = useSession();
  const { updateSettings } = useAuth();
  const toast = useToast();
  const availability = useNotificationAvailability();
  const queryClient = useQueryClient();

  const saved: Draft = {
    notifyEmail: settings.notifyEmail ?? '',
    notifyPhone: settings.notifyPhone ?? '',
    emailReminders: settings.emailReminders,
    whatsappReminders: settings.whatsappReminders,
  };
  const [draft, setDraft] = useState<Draft>(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<ReminderChannel | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = settingsUpdateSchema.safeParse({
      notifyEmail: draft.notifyEmail.trim() === '' ? null : draft.notifyEmail,
      notifyPhone: draft.notifyPhone.trim() === '' ? null : draft.notifyPhone,
      emailReminders: draft.emailReminders,
      whatsappReminders: draft.whatsappReminders,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    if (parsed.data.whatsappReminders && !parsed.data.notifyPhone) {
      setErrors({ notifyPhone: 'Add your WhatsApp number to turn on WhatsApp reminders' });
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      await updateSettings(parsed.data);
      // Show the values as saved (e.g. the phone number without spaces), so the form is clean.
      setDraft({
        notifyEmail: parsed.data.notifyEmail ?? '',
        notifyPhone: parsed.data.notifyPhone ?? '',
        emailReminders: draft.emailReminders,
        whatsappReminders: draft.whatsappReminders,
      });
      toast.success('Notification settings saved');
    } catch (err) {
      if (err instanceof ApiError && err.issues.length > 0) setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(channel: ReminderChannel) {
    if (testing) return;
    setTesting(channel);
    setFormError(null);
    const what = channel === 'EMAIL' ? 'email' : 'WhatsApp message';
    try {
      const { to, mode } = await settingsApi.sendTestNotification(channel);
      toast.success(
        mode === 'preview'
          ? `Test ${what} to ${to} recorded in Recent deliveries (preview: no keys yet)`
          : `Test ${what} sent to ${to}`,
      );
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setTesting(null);
      void queryClient.invalidateQueries({ queryKey: ['delivery-log'] });
    }
  }

  const channelsIn = (mode: ChannelMode) =>
    [
      availability.data?.email === mode && 'Email',
      availability.data?.whatsapp === mode && 'WhatsApp',
    ].filter(Boolean);
  const notReady = channelsIn('off');
  const preview = channelsIn('preview');

  return (
    <Card title="Notifications">
      <form className={formStyles.stack} onSubmit={onSubmit} noValidate>
        <p className={styles.intro}>
          Reminders are sent automatically at the times you choose on each task, by every channel
          switched on below. You don't need to press anything; "Send test" only checks a channel
          works.
        </p>
        {notReady.length > 0 && (
          <p className={styles.notice} role="status">
            {notReady.join(' and ')} {notReady.length > 1 ? "aren't" : "isn't"} connected on the
            server yet, so {notReady.length > 1 ? 'those reminders' : 'that reminder'} can't be
            delivered. Fill in the keys in backend/.env (instructions are next to them) and restart
            the backend.
          </p>
        )}
        {preview.length > 0 && (
          <p className={styles.notice} role="status">
            Preview mode for {preview.join(' and ')}: the server has no keys for{' '}
            {preview.length > 1 ? 'them' : 'it'} yet, so reminders are written to Recent deliveries
            below instead of being sent. Add the keys in backend/.env and restart the backend to
            send for real.
          </p>
        )}
        <FormError message={formError} />

        <div className={styles.channel}>
          <label className={styles.switchRow}>
            <span className={styles.channelName}>
              <Mail size={16} aria-hidden /> Email reminders
            </span>
            <input
              type="checkbox"
              role="switch"
              className={styles.switch}
              checked={draft.emailReminders}
              onChange={(e) => set('emailReminders', e.target.checked)}
            />
          </label>
          <Field
            label="Send to"
            hint={`Leave empty to use ${user.email}`}
            error={errors.notifyEmail}
          >
            <TextInput
              type="email"
              value={draft.notifyEmail}
              onChange={(e) => set('notifyEmail', e.target.value)}
              placeholder={user.email}
              autoComplete="email"
            />
          </Field>
          <Button
            size="sm"
            icon={<Send size={14} />}
            loading={testing === 'EMAIL'}
            disabled={testing !== null || dirty}
            onClick={() => sendTest('EMAIL')}
            title={dirty ? 'Save your changes first' : undefined}
          >
            Send test email
          </Button>
        </div>

        <div className={styles.channel}>
          <label className={styles.switchRow}>
            <span className={styles.channelName}>
              <MessageCircle size={16} aria-hidden /> WhatsApp reminders
            </span>
            <input
              type="checkbox"
              role="switch"
              className={styles.switch}
              checked={draft.whatsappReminders}
              onChange={(e) => set('whatsappReminders', e.target.checked)}
            />
          </label>
          <Field
            label="WhatsApp number"
            optional
            hint="With country code, e.g. +91 98765 43210"
            error={errors.notifyPhone}
          >
            <TextInput
              type="tel"
              value={draft.notifyPhone}
              onChange={(e) => set('notifyPhone', e.target.value)}
              placeholder="+91 98765 43210"
              autoComplete="tel"
            />
          </Field>
          <Button
            size="sm"
            icon={<Send size={14} />}
            loading={testing === 'WHATSAPP'}
            disabled={testing !== null || dirty || !settings.notifyPhone}
            onClick={() => sendTest('WHATSAPP')}
            title={!settings.notifyPhone ? 'Save your WhatsApp number first' : undefined}
          >
            Send test WhatsApp
          </Button>
        </div>

        <div>
          <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
            Save notifications
          </Button>
        </div>
      </form>
      <DeliveryLog />
    </Card>
  );
}
