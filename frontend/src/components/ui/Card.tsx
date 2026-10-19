import type { ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  as?: 'section' | 'div';
}

export function Card({
  title,
  action,
  children,
  className,
  padded = true,
  as: Tag = 'section',
}: CardProps) {
  return (
    <Tag className={[styles.card, className].filter(Boolean).join(' ')}>
      {(title || action) && (
        <header className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {action && <div className={styles.action}>{action}</div>}
        </header>
      )}
      <div className={padded ? styles.body : undefined}>{children}</div>
    </Tag>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.pageHeader}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </div>
  );
}
