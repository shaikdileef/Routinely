import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[styles.button, styles[variant], styles[size], className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden /> : icon}
      {children && <span>{children}</span>}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  label: string;
  children: ReactNode;
  variant?: 'ghost' | 'danger';
}

/** Icon-only button; `label` becomes its accessible name and tooltip. */
export function IconButton({
  label,
  children,
  className,
  variant = 'ghost',
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={[styles.iconButton, variant === 'danger' && styles.iconDanger, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
