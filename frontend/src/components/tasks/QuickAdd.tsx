import { taskCreateSchema, type DateKey } from '@planner/shared';
import { Plus } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useCreateTask } from '../../hooks/queries';
import { newRequestId } from '../../lib/ids';
import { Button } from '../ui/Button';
import styles from './QuickAdd.module.css';

interface QuickAddProps {
  dueDate?: DateKey;
  placeholder?: string;
}

/**
 * Single-line task creation. The idempotency key is kept until the server
 * confirms, so a retry after a failure or a double submit can't duplicate.
 */
export function QuickAdd({ dueDate, placeholder = 'Add a task…' }: QuickAddProps) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(newRequestId());
  const submitting = useRef(false);
  const createTask = useCreateTask();
  const toast = useToast();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    const input = { title, dueDate: dueDate ?? null, clientRequestId: requestId.current };
    const parsed = taskCreateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid task');
      return;
    }
    setError(null);
    submitting.current = true;
    try {
      await createTask.mutateAsync(input);
      setTitle('');
      requestId.current = newRequestId();
      toast.success('Task added');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.row}>
        <Plus size={18} className={styles.icon} aria-hidden />
        <label className="visually-hidden" htmlFor="quick-add">
          New task title
        </label>
        <input
          id="quick-add"
          className={styles.input}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          maxLength={200}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'quick-add-error' : undefined}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={createTask.isPending}
          disabled={!title.trim()}
        >
          Add
        </Button>
      </div>
      {error && (
        <p id="quick-add-error" className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
