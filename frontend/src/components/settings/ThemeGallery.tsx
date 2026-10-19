import { COLOR_THEMES, type ColorTheme } from '@planner/shared';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { applyColorTheme, useAuth, useSession } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';
import { runThemeTransition } from '../../lib/themeTransition';
import styles from './ThemeGallery.module.css';

const THEME_INFO: Record<ColorTheme, { name: string; tagline: string }> = {
  LAVENDER: { name: 'Lavender Glass', tagline: 'Soft violet with pastel light' },
  OCEAN: { name: 'Ocean Breeze', tagline: 'Aqua, sky and sea-foam' },
  SUNSET: { name: 'Sunset Glow', tagline: 'Peach, coral and golden hour' },
  FOREST: { name: 'Emerald Forest', tagline: 'Fresh mint and deep green' },
  ROSE: { name: 'Sakura', tagline: 'Cherry blossom pinks and lilac' },
  AURORA: { name: 'Aurora', tagline: 'Northern lights, best at night' },
};

/**
 * Colour theme picker. Each card is a live preview: it carries its own data-palette and
 * data-theme, so it is painted by the real theme CSS. Choosing one ripples it across the
 * app from the card and saves it to the user's settings.
 */
export function ThemeGallery() {
  const { settings } = useSession();
  const { updateSettings } = useAuth();
  const toast = useToast();
  const isDark = useIsDarkMode();
  const [saving, setSaving] = useState<ColorTheme | null>(null);

  async function choose(colorTheme: ColorTheme, origin: HTMLElement) {
    if (saving || colorTheme === settings.colorTheme) return;
    setSaving(colorTheme);
    try {
      await runThemeTransition(origin, async () => {
        await updateSettings({ colorTheme });
        applyColorTheme(colorTheme);
      });
      toast.success(`${THEME_INFO[colorTheme].name} theme applied`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className={styles.grid} role="radiogroup" aria-label="Colour theme">
      {COLOR_THEMES.map((colorTheme) => {
        const { name, tagline } = THEME_INFO[colorTheme];
        const selected = colorTheme === settings.colorTheme;
        return (
          <button
            key={colorTheme}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${name}: ${tagline}`}
            className={`${styles.card} ${selected ? styles.selected : ''}`}
            onClick={(e) => choose(colorTheme, e.currentTarget)}
            disabled={saving !== null}
            aria-busy={saving === colorTheme || undefined}
          >
            <span
              className={styles.preview}
              data-palette={colorTheme.toLowerCase()}
              data-theme={isDark ? 'dark' : 'light'}
              aria-hidden
            >
              <span className={styles.miniPanel}>
                <span className={styles.miniLine} />
                <span className={`${styles.miniLine} ${styles.short}`} />
                <span className={styles.miniRow}>
                  <span className={styles.miniPill} />
                  <span className={styles.miniBead}>
                    <Check size={10} strokeWidth={3} />
                  </span>
                </span>
              </span>
              {selected && (
                <span className={styles.selectedBadge}>
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </span>
            <span className={styles.name}>{name}</span>
            <span className={styles.tagline}>{tagline}</span>
          </button>
        );
      })}
    </div>
  );
}
