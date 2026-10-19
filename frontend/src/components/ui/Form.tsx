import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import styles from './Form.module.css';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

/** Wires a label, hint and error message to its single input child. */
export function Field({ label, error, hint, optional, className, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-msg`;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? messageId : undefined,
      })
    : children;
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> (optional)</span>}
      </label>
      {control}
      {error ? (
        <p id={messageId} className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className={styles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={[styles.input, className].filter(Boolean).join(' ')} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={[styles.input, styles.textarea, className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={[styles.input, styles.select, className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </select>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className={styles.formError} role="alert">
      {message}
    </div>
  );
}

export const formStyles = styles;
