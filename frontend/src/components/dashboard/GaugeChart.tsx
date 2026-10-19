import { useId } from 'react';
import { useEntranceProgress } from '../../hooks/useEntranceProgress';
import styles from './Charts.module.css';

interface GaugeChartProps {
  /** 0–100. */
  value: number;
  /** Accessible name, e.g. "Today's progress". */
  label: string;
  /** Line under the percentage, e.g. "3 of 5 done". */
  detail: string;
  width?: number;
}

const STROKE = 14;

/** Half-circle gauge: progress towards a goal of 100%, with the percentage in the middle. */
export function GaugeChart({ value, label, detail, width = 210 }: GaugeChartProps) {
  const gradientId = useId();
  const entrance = useEntranceProgress();
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  // The arc and number sweep up from zero on first show; later changes ease via CSS.
  const shown = pct * entrance;
  const entering = entrance < 1;
  const r = (width - STROKE) / 2;
  const cy = r + STROKE / 2;
  const height = cy + STROKE / 2;
  // Left end to right end over the top; pathLength 100 lets the dash map straight to percent.
  const arc = `M${STROKE / 2},${cy} A${r},${r} 0 0 1 ${width - STROKE / 2},${cy}`;

  return (
    <div
      className={styles.gauge}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}%, ${detail}`}
    >
      <div className={styles.gaugeArc}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" className={styles.gaugeStopStart} />
              <stop offset="100%" className={styles.gaugeStopEnd} />
            </linearGradient>
          </defs>
          <path d={arc} className={styles.gaugeTrack} strokeWidth={STROKE} pathLength={100} />
          {shown > 0 && (
            <path
              d={arc}
              className={`${styles.gaugeValue} ${entering ? '' : styles.gaugeSettled}`}
              stroke={`url(#${gradientId})`}
              strokeWidth={STROKE}
              pathLength={100}
              strokeDasharray={`${shown} 100`}
            />
          )}
        </svg>
        <div className={styles.gaugeReadout}>
          <strong>{Math.round(shown)}%</strong>
          <span>{detail}</span>
        </div>
      </div>
      <div className={styles.gaugeScale} style={{ width }} aria-hidden>
        <span>0%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
