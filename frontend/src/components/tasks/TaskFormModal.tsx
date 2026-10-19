import {
  COLOR_PALETTE,
  dateKeyInTimeZone,
  habitCreateSchema,
  PRIORITIES,
  PRIORITY_LABELS,
  reminderKey,
  STATUS_LABELS,
  TASK_STATUSES,
  taskCreateSchema,
  type Priority,
  type ReminderSpec,
  type Task,
  type TaskCreateInput,
  type TaskImageKind,
  type TaskStatus,
} from '@planner/shared';
import { ChevronDown, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../../api/client';
import { useSession } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  useCategories,
  useCreateHabit,
  useCreateTask,
  useDeleteTask,
  useSaveTaskImages,
  useSaveTaskReminders,
  useTaskReminders,
  useUpdateTask,
  type TaskImageChange,
  type TaskImageChanges,
} from '../../hooks/queries';
import { formatDate } from '../../lib/format';
import { newRequestId } from '../../lib/ids';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field, FormError, formStyles, Select, TextArea, TextInput } from '../ui/Form';
import { Modal } from '../ui/Modal';
import { ImagePicker } from './ImagePicker';
import { ReminderPicker } from './ReminderPicker';
import { RepeatPicker, type Repeat } from './RepeatPicker';
import styles from './TaskFormModal.module.css';

export interface TaskDraft {
  title: string;
  description: string;
  notes: string;
  dueDate: string;
  startDate: string;
  startTime: string;
  endTime: string;
  priority: Priority;
  status: TaskStatus;
  categoryId: string;
  tags: string;
  estimatedMinutes: string;
  /** New tasks only: a repeating task is saved as a daily task (habit). */
  repeat: Repeat;
  repeatDays: number[];
}

function draftFromTask(task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description ?? '',
    notes: task.notes ?? '',
    dueDate: task.dueDate ?? '',
    startDate: task.startDate ?? '',
    startTime: task.startTime ?? '',
    endTime: task.endTime ?? '',
    priority: task.priority,
    status: task.status,
    categoryId: task.categoryId ?? '',
    tags: task.tags.join(', '),
    estimatedMinutes: task.estimatedMinutes?.toString() ?? '',
    repeat: 'NEVER',
    repeatDays: [],
  };
}

/** Fields tucked under "More options" to keep the everyday form short. */
const MORE_OPTION_FIELDS = [
  'status',
  'startDate',
  'startTime',
  'endTime',
  'estimatedMinutes',
  'tags',
  'notes',
] as const satisfies readonly (keyof TaskDraft)[];

/** Open "More options" up front when the task already uses any of those fields. */
function usesMoreOptions(d: TaskDraft) {
  return MORE_OPTION_FIELDS.some((f) =>
    f === 'status' ? d.status !== 'TODO' : d[f].trim() !== '',
  );
}

const orNull = (v: string) => (v.trim() === '' ? null : v);

export function draftToInput(d: TaskDraft): TaskCreateInput {
  const minutes = d.estimatedMinutes.trim();
  return {
    title: d.title,
    description: orNull(d.description),
    notes: orNull(d.notes),
    dueDate: orNull(d.dueDate),
    startDate: orNull(d.startDate),
    startTime: orNull(d.startTime),
    endTime: orNull(d.endTime),
    priority: d.priority,
    status: d.status,
    categoryId: orNull(d.categoryId),
    tags: d.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    estimatedMinutes: minutes === '' ? null : Number(minutes),
  };
}

interface TaskFormModalProps {
  task?: Task;
  defaults?: Partial<TaskDraft>;
  onClose: () => void;
}

export function TaskFormModal({ task, defaults, onClose }: TaskFormModalProps) {
  const { settings } = useSession();
  const toast = useToast();
  const categories = useCategories();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const saveImages = useSaveTaskImages();
  const requestId = useRef(newRequestId());
  const submitting = useRef(false);
  // Set once the task exists, so a retry after a failed image upload updates instead of creating.
  const savedId = useRef<string | null>(task?.id ?? null);
  const [imageChanges, setImageChanges] = useState<TaskImageChanges>({});

  const [draft, setDraft] = useState<TaskDraft>(() =>
    task
      ? draftFromTask(task)
      : {
          title: '',
          description: '',
          notes: '',
          dueDate: '',
          startDate: '',
          startTime: '',
          endTime: '',
          priority: settings.defaultPriority,
          status: 'TODO',
          categoryId: '',
          tags: '',
          estimatedMinutes: '',
          repeat: 'NEVER',
          repeatDays: [],
          ...defaults,
        },
  );
  const repeating = !task && draft.repeat !== 'NEVER';
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMore, setShowMore] = useState(() => usesMoreOptions(draft));
  // A problem in a hidden field must never be hidden: keep the section open while it has errors.
  const hasMoreErrors = MORE_OPTION_FIELDS.some((f) => errors[f]);
  const moreOpen = showMore || hasMoreErrors;

  const createHabit = useCreateHabit();
  const savedReminders = useTaskReminders(task?.id);
  const saveReminders = useSaveTaskReminders();
  // null = untouched, so the saved reminders are shown and nothing is re-saved.
  const [reminderEdits, setReminderEdits] = useState<ReminderSpec[] | null>(null);
  const reminders = reminderEdits ?? savedReminders.data?.map((r) => r.spec) ?? [];

  const saving =
    createTask.isPending ||
    updateTask.isPending ||
    saveImages.isPending ||
    saveReminders.isPending ||
    createHabit.isPending;
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setImage = (kind: TaskImageKind, change: TaskImageChange | undefined) =>
    setImageChanges((c) => ({ ...c, [kind]: change }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Synchronous guard: `saving` only flips after a re-render, a ref blocks double submits immediately.
    if (submitting.current) return;
    setFormError(null);
    if (repeating) return saveAsDailyTask();

    const input = draftToInput(draft);
    if (Number.isNaN(input.estimatedMinutes)) {
      setErrors({ estimatedMinutes: 'Enter a number of minutes' });
      return;
    }
    const parsed = taskCreateSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});

    submitting.current = true;
    try {
      const saved = savedId.current
        ? await updateTask.mutateAsync({ id: savedId.current, input })
        : await createTask.mutateAsync({ ...input, clientRequestId: requestId.current });
      savedId.current = saved.id;

      if (Object.values(imageChanges).some(Boolean)) {
        try {
          await saveImages.mutateAsync({ id: saved.id, changes: imageChanges });
        } catch (err) {
          const reason = errorMessage(err).replace(/\.$/, '');
          setFormError(
            `The task was saved, but its image wasn't (${reason}). Save again to retry.`,
          );
          return;
        }
      }

      const remindersChanged =
        reminderEdits !== null &&
        reminderEdits.map(reminderKey).sort().join() !==
          (savedReminders.data ?? [])
            .map((r) => r.key)
            .sort()
            .join();
      if (remindersChanged) {
        try {
          await saveReminders.mutateAsync({ id: saved.id, reminders: reminderEdits });
        } catch (err) {
          if (err instanceof ApiError && err.issues.length > 0) {
            setErrors({ reminders: err.issues[0].message });
          }
          const reason = errorMessage(err).replace(/\.$/, '');
          setFormError(
            `The task was saved, but its reminders weren't (${reason}). Save again to retry.`,
          );
          return;
        }
      }
      toast.success(task ? 'Task updated' : 'Task created');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.issues.length > 0) setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
    } finally {
      submitting.current = false;
    }
  }

  /** A repeating task is a daily task: saved as a habit so it shows up every scheduled day. */
  async function saveAsDailyTask() {
    const parsed = habitCreateSchema.safeParse({
      name: draft.title,
      description: draft.description,
      color: COLOR_PALETTE[0],
      frequency: draft.repeat === 'DAILY' ? 'DAILY' : 'SPECIFIC_DAYS',
      daysOfWeek: draft.repeat === 'DAILY' ? [] : draft.repeatDays,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'name' ? 'title' : String(issue.path[0] ?? 'form');
        next[key === 'daysOfWeek' ? 'repeat' : key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    submitting.current = true;
    try {
      await createHabit.mutateAsync(parsed.data);
      toast.success('Daily task added. It will appear on your dashboard each day.');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.issues.length > 0) {
        const fields = err.fieldErrors();
        setErrors({ title: fields.name, repeat: fields.daysOfWeek });
      }
      setFormError(errorMessage(err));
    } finally {
      submitting.current = false;
    }
  }

  async function onDelete() {
    if (!task) return;
    try {
      await deleteTask.mutateAsync(task);
      toast.success('Task deleted');
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      setFormError(errorMessage(err));
    }
  }

  const formId = 'task-form';

  return (
    <>
      <Modal
        open
        size="lg"
        title={task ? 'Edit task' : 'New task'}
        onClose={onClose}
        busy={saving}
        footer={
          <div className={styles.footer}>
            {task && (
              <Button
                variant="ghost"
                icon={<Trash2 size={16} />}
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                Delete
              </Button>
            )}
            <span className={styles.spacer} />
            <Button onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={formId} loading={saving}>
              {task ? 'Save changes' : repeating ? 'Add daily task' : 'Create task'}
            </Button>
          </div>
        }
      >
        <form id={formId} className={formStyles.stack} onSubmit={onSubmit} noValidate>
          <FormError message={formError} />
          <Field label="Title" error={errors.title}>
            <TextInput
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="What needs to be done?"
              maxLength={200}
              data-autofocus
              required
            />
          </Field>

          <Field label="Description" optional error={errors.description}>
            <TextArea
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
            />
          </Field>

          {!task && (
            <RepeatPicker
              repeat={draft.repeat}
              days={draft.repeatDays}
              onChange={(repeat, repeatDays) => setDraft((d) => ({ ...d, repeat, repeatDays }))}
              error={errors.repeat}
              disabled={saving}
            />
          )}

          {!repeating && (
            <>
              <div className={formStyles.row}>
                <ImagePicker
                  label="Before image"
                  hint="Shown while the task is still open"
                  savedUrl={task?.images.before ?? null}
                  change={imageChanges.before}
                  onChange={(change) => setImage('before', change)}
                  disabled={saving}
                />
                <ImagePicker
                  label="After image"
                  hint="Shown once you tick the task as done"
                  savedUrl={task?.images.after ?? null}
                  change={imageChanges.after}
                  onChange={(change) => setImage('after', change)}
                  disabled={saving}
                />
              </div>

              <div className={styles.essentials}>
                <Field label="Priority" error={errors.priority}>
                  <Select
                    value={draft.priority}
                    onChange={(e) => set('priority', e.target.value as Priority)}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Due date" optional error={errors.dueDate}>
                  <TextInput
                    type="date"
                    value={draft.dueDate}
                    onChange={(e) => set('dueDate', e.target.value)}
                  />
                </Field>
                <Field label="Category" optional error={errors.categoryId}>
                  <Select
                    value={draft.categoryId}
                    onChange={(e) => set('categoryId', e.target.value)}
                  >
                    <option value="">No category</option>
                    {categories.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <ReminderPicker
                value={reminders}
                onChange={setReminderEdits}
                dueDate={draft.dueDate}
                saved={savedReminders.data ?? []}
                error={errors.reminders}
                disabled={saving}
              />

              <button
                type="button"
                className={styles.moreToggle}
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={moreOpen}
                aria-controls="task-more-options"
                disabled={hasMoreErrors}
              >
                <ChevronDown size={16} aria-hidden className={moreOpen ? styles.chevronOpen : ''} />
                {moreOpen ? 'Fewer options' : 'More options'}
                {!moreOpen && <span className={styles.moreHint}>status, times, tags, notes…</span>}
              </button>

              {moreOpen && (
                <div id="task-more-options" className={formStyles.stack}>
                  <div className={formStyles.row}>
                    <Field label="Status" error={errors.status}>
                      <Select
                        value={draft.status}
                        onChange={(e) => set('status', e.target.value as TaskStatus)}
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Start date" optional error={errors.startDate}>
                      <TextInput
                        type="date"
                        value={draft.startDate}
                        onChange={(e) => set('startDate', e.target.value)}
                      />
                    </Field>
                  </div>

                  <div className={formStyles.row}>
                    <Field label="Start time" optional error={errors.startTime}>
                      <TextInput
                        type="time"
                        value={draft.startTime}
                        onChange={(e) => set('startTime', e.target.value)}
                      />
                    </Field>
                    <Field label="End time" optional error={errors.endTime}>
                      <TextInput
                        type="time"
                        value={draft.endTime}
                        onChange={(e) => set('endTime', e.target.value)}
                      />
                    </Field>
                  </div>

                  <div className={formStyles.row}>
                    <Field
                      label="Estimated duration (minutes)"
                      optional
                      error={errors.estimatedMinutes}
                    >
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={1440}
                        value={draft.estimatedMinutes}
                        onChange={(e) => set('estimatedMinutes', e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Tags"
                      optional
                      hint="Separate tags with commas"
                      error={errors.tags}
                    >
                      <TextInput
                        value={draft.tags}
                        onChange={(e) => set('tags', e.target.value)}
                        placeholder="work, focus"
                      />
                    </Field>
                  </div>

                  <Field label="Notes" optional error={errors.notes}>
                    <TextArea
                      value={draft.notes}
                      onChange={(e) => set('notes', e.target.value)}
                      rows={3}
                    />
                  </Field>
                </div>
              )}
            </>
          )}

          {task?.completedAt && (
            <p className={styles.meta}>
              Completed{' '}
              {formatDate(
                dateKeyInTimeZone(new Date(task.completedAt), settings.timezone),
                'shortWithYear',
              )}
            </p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete task?"
        message={
          <>
            <strong>{task?.title}</strong> will be permanently deleted. This can't be undone.
          </>
        }
        confirmLabel="Delete task"
        busy={deleteTask.isPending}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
