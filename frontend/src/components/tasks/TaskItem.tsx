import { isOverdue, type DateKey, type Task } from '@planner/shared';
import { Clock, Pencil, RotateCcw, Timer, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/client';
import { useTaskEditor } from '../../context/TaskEditorContext';
import { useToast } from '../../context/ToastContext';
import { useDeleteTask, useUpdateTask } from '../../hooks/queries';
import { formatDuration, formatInstantDate, formatTimeRange } from '../../lib/format';
import { CategoryChip, DueBadge, PriorityBadge, StatusBadge, TagChip } from '../ui/Badges';
import { IconButton } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import styles from './TaskItem.module.css';

interface TaskItemProps {
  task: Task;
  today: DateKey;
  timezone: string;
  showDueDate?: boolean;
  /** Completed list: show completion date and a Reopen action. */
  variant?: 'default' | 'completed';
}

export function TaskItem({
  task,
  today,
  timezone,
  showDueDate = true,
  variant = 'default',
}: TaskItemProps) {
  const editor = useTaskEditor();
  const toast = useToast();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [confirming, setConfirming] = useState(false);

  const done = task.status === 'COMPLETED';
  const overdue = isOverdue(task, today);
  const time = formatTimeRange(task.startTime, task.endTime);

  async function toggle() {
    try {
      await updateTask.mutateAsync({ id: task.id, input: { status: done ? 'TODO' : 'COMPLETED' } });
      if (done) toast.success('Task reopened');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove() {
    try {
      await deleteTask.mutateAsync(task);
      toast.success('Task deleted');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <li
      className={[
        styles.item,
        done && styles.done,
        overdue && styles.overdue,
        updateTask.isPending && styles.pending,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <TaskCheckbox task={task} onToggle={toggle} disabled={updateTask.isPending} />
      <div className={styles.content}>
        <button type="button" className={styles.title} onClick={() => editor.openTask(task)}>
          {task.title}
        </button>
        <div className={styles.meta}>
          {variant === 'completed' && task.completedAt && (
            <span className={styles.metaText}>
              Completed {formatInstantDate(task.completedAt, timezone, today).toLowerCase()}
            </span>
          )}
          {showDueDate && task.dueDate && variant !== 'completed' && (
            <DueBadge dueDate={task.dueDate} status={task.status} today={today} />
          )}
          {time && (
            <span className={styles.metaText}>
              <Clock size={12} aria-hidden /> {time}
            </span>
          )}
          {task.status === 'IN_PROGRESS' && <StatusBadge status={task.status} />}
          {task.category && <CategoryChip category={task.category} />}
          {task.estimatedMinutes && (
            <span className={styles.metaText} title="Estimated duration">
              <Timer size={12} aria-hidden /> {formatDuration(task.estimatedMinutes)}
            </span>
          )}
          {task.tags.map((t) => (
            <TagChip key={t} tag={t} />
          ))}
        </div>
      </div>
      <PriorityBadge priority={task.priority} compact />
      <div className={styles.actions}>
        {variant === 'completed' ? (
          <IconButton
            label={`Reopen "${task.title}"`}
            onClick={toggle}
            disabled={updateTask.isPending}
          >
            <RotateCcw size={16} />
          </IconButton>
        ) : (
          <IconButton label={`Edit "${task.title}"`} onClick={() => editor.openTask(task)}>
            <Pencil size={16} />
          </IconButton>
        )}
        <IconButton
          label={`Delete "${task.title}"`}
          variant="danger"
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={16} />
        </IconButton>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Delete task?"
        message={
          <>
            <strong>{task.title}</strong> will be permanently deleted. This can't be undone.
          </>
        }
        confirmLabel="Delete task"
        busy={deleteTask.isPending}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}

interface TaskCheckboxProps {
  task: Task;
  onToggle: () => void;
  disabled: boolean;
}

/**
 * The completion checkbox. When the task has pictures, the box itself shows them: the
 * "before" image while open, the "after" image once ticked (falling back to "before"),
 * flipping over whenever the picture changes.
 */
function TaskCheckbox({ task, onToggle, disabled }: TaskCheckboxProps) {
  const done = task.status === 'COMPLETED';
  const url = done ? (task.images.after ?? task.images.before) : task.images.before;
  const previous = useRef(url);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (previous.current === url) return;
    previous.current = url;
    setFlipping(true);
  }, [url]);

  const input = (
    <input
      type="checkbox"
      className={url ? styles.imageInput : styles.check}
      checked={done}
      onChange={onToggle}
      disabled={disabled}
      aria-label={
        done ? `Mark "${task.title}" as not completed` : `Mark "${task.title}" as completed`
      }
    />
  );
  if (!url) return input;

  return (
    <label className={`${styles.imageCheck} ${done ? styles.imageCheckDone : ''}`}>
      <img
        key={url}
        src={url}
        alt=""
        className={`${styles.imageFace} ${flipping ? styles.imageFlip : ''}`}
        onAnimationEnd={() => setFlipping(false)}
      />
      {input}
      <span className={styles.imageTick} aria-hidden />
    </label>
  );
}
