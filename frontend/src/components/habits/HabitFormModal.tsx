import { COLOR_PALETTE, habitCreateSchema, type Habit, type HabitFrequency } from '@planner/shared';
import { useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../../api/client';
import { useSession } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useCreateHabit, useUpdateHabit } from '../../hooks/queries';
import { Button } from '../ui/Button';
import { ColorPicker } from '../ui/ColorPicker';
import { Field, FormError, formStyles, TextInput } from '../ui/Form';
import { Modal } from '../ui/Modal';
import styles from './Habits.module.css';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function orderedDays(weekStartsOn: number) {
  return Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7);
}

export function frequencyLabel(h: Pick<Habit, 'frequency' | 'daysOfWeek'>): string {
  if (h.frequency === 'DAILY' || h.daysOfWeek.length === 7) return 'Every day';
  if (h.daysOfWeek.join() === '1,2,3,4,5') return 'Weekdays';
  if (h.daysOfWeek.join() === '0,6') return 'Weekends';
  return h.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ');
}

export function HabitFormModal({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const { weekStartsOn } = useSession().settings;
  const toast = useToast();
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const [name, setName] = useState(habit?.name ?? '');
  const [description, setDescription] = useState(habit?.description ?? '');
  const [color, setColor] = useState<string>(habit?.color ?? COLOR_PALETTE[0]);
  const [frequency, setFrequency] = useState<HabitFrequency>(habit?.frequency ?? 'DAILY');
  const [days, setDays] = useState<number[]>(
    habit?.daysOfWeek.length ? habit.daysOfWeek : [1, 3, 5],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const input = {
      name,
      description,
      color,
      frequency,
      daysOfWeek: frequency === 'DAILY' ? [] : days,
    };
    const parsed = habitCreateSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      if (habit) await update.mutateAsync({ id: habit.id, input });
      else await create.mutateAsync(input);
      toast.success(habit ? 'Habit updated' : 'Habit created');
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
    }
  }

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  return (
    <Modal
      open
      title={habit ? 'Edit habit' : 'New habit'}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="habit-form" loading={saving}>
            {habit ? 'Save changes' : 'Create habit'}
          </Button>
        </>
      }
    >
      <form id="habit-form" className={formStyles.stack} onSubmit={onSubmit} noValidate>
        <FormError message={formError} />
        <Field label="Name" error={errors.name}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Read 20 pages"
            maxLength={80}
            data-autofocus
          />
        </Field>
        <Field label="Description" optional error={errors.description}>
          <TextInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
          />
        </Field>
        <fieldset className={styles.fieldset}>
          <legend className={formStyles.label}>Frequency</legend>
          <div className={styles.radioRow}>
            <label className={styles.radio}>
              <input
                type="radio"
                name="frequency"
                checked={frequency === 'DAILY'}
                onChange={() => setFrequency('DAILY')}
              />
              Every day
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="frequency"
                checked={frequency === 'SPECIFIC_DAYS'}
                onChange={() => setFrequency('SPECIFIC_DAYS')}
              />
              Specific days
            </label>
          </div>
          {frequency === 'SPECIFIC_DAYS' && (
            <div className={styles.dayPicker} role="group" aria-label="Days of the week">
              {orderedDays(weekStartsOn).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days.includes(d)}
                  className={styles.dayToggle}
                  onClick={() => toggleDay(d)}
                >
                  {DAY_NAMES[d]}
                </button>
              ))}
            </div>
          )}
          {errors.daysOfWeek && (
            <p className={formStyles.error} role="alert">
              {errors.daysOfWeek}
            </p>
          )}
        </fieldset>
        <ColorPicker value={color} onChange={setColor} error={errors.color} />
      </form>
    </Modal>
  );
}
