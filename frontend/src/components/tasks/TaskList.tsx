import type { Task } from '@planner/shared';
import type { ReactNode } from 'react';
import { useToday } from '../../hooks/useToday';
import { TaskItem } from './TaskItem';
import styles from './TaskList.module.css';

interface TaskListProps {
  tasks: Task[];
  showDueDate?: boolean;
  variant?: 'default' | 'completed';
  empty?: ReactNode;
  label?: string;
}

export function TaskList({ tasks, showDueDate, variant, empty, label }: TaskListProps) {
  const { today, timezone } = useToday();
  if (tasks.length === 0) return <>{empty ?? null}</>;
  return (
    <ul className={styles.list} aria-label={label}>
      {tasks.map((t) => (
        <TaskItem
          key={t.id}
          task={t}
          today={today}
          timezone={timezone}
          showDueDate={showDueDate}
          variant={variant}
        />
      ))}
    </ul>
  );
}

export function TaskGroup({
  title,
  count,
  tone,
  children,
}: {
  title: ReactNode;
  count?: number;
  tone?: 'danger';
  children: ReactNode;
}) {
  return (
    <section className={styles.group}>
      <h3 className={`${styles.groupTitle} ${tone === 'danger' ? styles.danger : ''}`}>
        {title}
        {count !== undefined && <span className={styles.count}>{count}</span>}
      </h3>
      {children}
    </section>
  );
}
