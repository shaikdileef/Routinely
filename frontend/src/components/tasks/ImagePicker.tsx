import { ImagePlus, RefreshCw, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import type { TaskImageChange } from '../../hooks/queries';
import { IMAGE_ACCEPT, validateImageFile } from '../../lib/images';
import styles from './ImagePicker.module.css';

interface ImagePickerProps {
  label: string;
  hint: string;
  /** The image already saved on the task, if any. */
  savedUrl: string | null;
  change: TaskImageChange | undefined;
  onChange: (change: TaskImageChange | undefined) => void;
  disabled?: boolean;
}

/** Reads a file as a data URL for previewing (data: URLs are allowed by the app's CSP). */
function usePreview(file: File | null) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    setPreview(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  return preview;
}

/** Choose, preview, replace or remove one task image. Changes are saved with the task. */
export function ImagePicker({
  label,
  hint,
  savedUrl,
  change,
  onChange,
  disabled,
}: ImagePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const newFile = change?.type === 'set' ? change.file : null;
  const preview = usePreview(newFile);
  const shownUrl = newFile ? preview : change?.type === 'remove' ? null : savedUrl;

  function pick(file: File | undefined) {
    if (!file) return;
    const problem = validateImageFile(file);
    setError(problem);
    if (!problem) onChange({ type: 'set', file });
  }

  function remove() {
    setError(null);
    // Dropping an unsaved pick just restores the saved image (or nothing).
    onChange(savedUrl && !newFile ? { type: 'remove' } : undefined);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!disabled) pick(e.dataTransfer.files[0]);
  }

  return (
    <div className={styles.picker}>
      <label htmlFor={inputId} className={styles.label}>
        <span>
          {label}
          <span className={styles.optional}> (optional)</span>
        </span>
        <span className={styles.hint}>{hint}</span>
      </label>

      <div
        className={[styles.frame, dragging && styles.dragging, shownUrl && styles.filled]
          .filter(Boolean)
          .join(' ')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {shownUrl ? (
          <>
            <img src={shownUrl} alt={`${label} preview`} className={styles.image} />
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.action}
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
              >
                <RefreshCw size={14} aria-hidden /> Change
              </button>
              <button type="button" className={styles.action} onClick={remove} disabled={disabled}>
                <X size={14} aria-hidden /> Remove
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className={styles.empty}
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            <ImagePlus size={20} aria-hidden />
            <span>Add image</span>
            <span className={styles.emptyHint}>or drop one here</span>
          </button>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={IMAGE_ACCEPT}
          className="visually-hidden"
          tabIndex={-1}
          disabled={disabled}
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
