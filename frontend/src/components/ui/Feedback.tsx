import { AlertTriangle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '../../api/client';
import { Button } from './Button';
import styles from './Feedback.module.css';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className={styles.spinner} role="status">
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className={styles.loading}>
      <Spinner label={label} />
      <span aria-hidden>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className={styles.error} role="alert">
      <AlertTriangle size={20} aria-hidden />
      <div>
        <p className={styles.errorTitle}>Couldn't load this</p>
        <p className={styles.errorText}>{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, compact }: EmptyStateProps) {
  return (
    <div className={`${styles.empty} ${compact ? styles.compact : ''}`}>
      <span className={styles.emptyIcon} aria-hidden>
        <Icon size={compact ? 18 : 22} />
      </span>
      <p className={styles.emptyTitle}>{title}</p>
      {description && <p className={styles.emptyText}>{description}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={styles.progress}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <span className={styles.progressFill} style={{ width: `${pct}%` }} />
    </div>
  );
}
