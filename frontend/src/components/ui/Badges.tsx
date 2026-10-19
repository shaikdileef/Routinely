import {
  deadlineUrgency,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type CategorySummary,
  type DateKey,
  type Priority,
  type TaskStatus,
} from '@planner/shared';
import { AlertCircle, Calendar, Flag } from 'lucide-react';
import { relativeDay } from '../../lib/format';
import styles from './Badges.module.css';

export function PriorityBadge({ priority, compact }: { priority: Priority; compact?: boolean }) {
  return (
    <span
      className={`${styles.badge} ${styles.priority} ${styles[`p${priority}`]}`}
      title={`${PRIORITY_LABELS[priority]} priority`}
    >
      <Flag size={12} aria-hidden />
      {compact ? (
        <span className="visually-hidden">{PRIORITY_LABELS[priority]} priority</span>
      ) : (
        PRIORITY_LABELS[priority]
      )}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`${styles.badge} ${styles.status} ${styles[`s${status}`]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function CategoryChip({ category }: { category: CategorySummary }) {
  return (
    <span className={`${styles.badge} ${styles.category}`}>
      <span className={styles.dot} style={{ background: category.color }} aria-hidden />
      {category.name}
    </span>
  );
}

export function TagChip({ tag }: { tag: string }) {
  return <span className={`${styles.badge} ${styles.tag}`}>#{tag}</span>;
}

/** Due date with an urgency indicator (icon + text, never color alone). */
export function DueBadge({
  dueDate,
  status,
  today,
}: {
  dueDate: DateKey;
  status: TaskStatus;
  today: DateKey;
}) {
  const urgency = deadlineUrgency({ dueDate, status }, today);
  const label = relativeDay(dueDate, today);
  return (
    <span className={`${styles.badge} ${styles.due} ${styles[`u_${urgency}`] ?? ''}`}>
      {urgency === 'overdue' ? (
        <AlertCircle size={12} aria-hidden />
      ) : (
        <Calendar size={12} aria-hidden />
      )}
      {urgency === 'overdue' ? `Overdue · ${label}` : label}
    </span>
  );
}
