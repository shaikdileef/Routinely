import { COLOR_PALETTE } from '@planner/shared';
import { Check } from 'lucide-react';
import { formStyles } from './Form';
import styles from './ColorPicker.module.css';

const NAMES: Record<string, string> = {
  '#4f46e5': 'Indigo',
  '#0891b2': 'Cyan',
  '#059669': 'Emerald',
  '#65a30d': 'Lime',
  '#d97706': 'Amber',
  '#dc2626': 'Red',
  '#db2777': 'Pink',
  '#7c3aed': 'Violet',
  '#475569': 'Slate',
  '#0d9488': 'Teal',
};

export function ColorPicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (c: string) => void;
  error?: string;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={formStyles.label}>Color</legend>
      <div className={styles.swatches}>
        {COLOR_PALETTE.map((c) => (
          <label key={c} className={styles.swatch} style={{ background: c }} title={NAMES[c]}>
            <input
              type="radio"
              name="color"
              value={c}
              checked={value === c}
              onChange={() => onChange(c)}
              className="visually-hidden"
              aria-label={NAMES[c]}
            />
            {value === c && <Check size={14} color="#fff" aria-hidden />}
          </label>
        ))}
      </div>
      {error && (
        <p className={formStyles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
