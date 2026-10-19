import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useEntranceProgress } from '../../hooks/useEntranceProgress';
import styles from './Dashboard.module.css';

export interface BarDatum {
  key: string;
  /** Axis label under the bar. */
  label: string;
  value: number;
  /** Optional background bar drawn behind the value, e.g. tasks planned vs tasks done. */
  track?: number;
  /** Highlighted bar: bold axis label and a direct value label. */
  emphasis?: boolean;
  /** Recessive bar, e.g. a week that is still in progress. */
  muted?: boolean;
  /** Text for the direct value label on emphasised bars. */
  valueLabel?: string;
  tooltip: ReactNode;
  /** Plain-text description for the accessible data table. */
  description: string;
}

interface BarChartProps {
  data: BarDatum[];
  /** Short summary for screen readers, e.g. "Tasks completed per week". */
  label: string;
  /** Dashed reference line, e.g. an average. */
  reference?: { value: number; label: string };
  /** The y-axis never scales below this, so tiny values don't look dramatic. */
  minScale?: number;
  height?: number;
}

const AXIS_H = 22;
const TOP = 20;
const LEFT = 28;
const BAR_MAX_W = 28;
const FALLBACK_WIDTH = 320;

/** Rounds up to 1, 2, 4, 5, 6 or 8 × a power of ten, so the half-way gridline stays readable. */
function niceCeil(value: number) {
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 4, 5, 6, 8, 10].map((m) => m * power).find((v) => v >= value) ?? value;
}

function formatTick(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Bar with a 4px rounded top, anchored square to the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') {
      setWidth(el.clientWidth || FALLBACK_WIDTH);
      return;
    }
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/** Single-series bar chart with hover tooltips, sized in real pixels to its container. */
export function BarChart({ data, label, reference, minScale = 4, height = 170 }: BarChartProps) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  // Bars rise from the baseline on first show.
  const entrance = useEntranceProgress();

  const width = measured || FALLBACK_WIDTH;
  const plotH = height - AXIS_H - TOP;
  const plotW = width - LEFT;
  const peak = Math.max(
    minScale,
    reference?.value ?? 0,
    ...data.map((d) => Math.max(d.value, d.track ?? 0)),
  );
  const scaleMax = niceCeil(peak);
  const slot = plotW / data.length;
  const barW = Math.min(BAR_MAX_W, slot * 0.55);
  const yOf = (v: number) => TOP + plotH * (1 - v / scaleMax);
  const heightOf = (v: number) => (v <= 0 ? 0 : Math.max(4, (v / scaleMax) * plotH) * entrance);

  return (
    <div className={styles.chart} ref={ref}>
      <svg
        width={width}
        height={height}
        className={styles.chartSvg}
        aria-hidden
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={LEFT}
              x2={width}
              y1={yOf(scaleMax * f)}
              y2={yOf(scaleMax * f)}
              className={styles.gridLine}
            />
            <text x={0} y={yOf(scaleMax * f) + 4} className={styles.axisText}>
              {formatTick(scaleMax * f)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const x = LEFT + slot * i + (slot - barW) / 2;
          const valueH = heightOf(d.value);
          const trackH = heightOf(d.track ?? 0);
          const dimmed = hover !== null && hover !== i;
          const barClass = [styles.bar, d.muted && styles.barMuted, dimmed && styles.barDimmed]
            .filter(Boolean)
            .join(' ');

          return (
            <g key={d.key} onMouseEnter={() => setHover(i)}>
              <rect
                x={LEFT + slot * i}
                y={TOP}
                width={slot}
                height={plotH + AXIS_H}
                fill="transparent"
              />
              {trackH > 0 && (
                <path
                  d={barPath(x, TOP + plotH - trackH, barW, trackH)}
                  className={styles.barTrack}
                />
              )}
              {valueH > 0 && (
                <path d={barPath(x, TOP + plotH - valueH, barW, valueH)} className={barClass} />
              )}
              {d.emphasis && d.valueLabel && (
                <text
                  x={x + barW / 2}
                  y={TOP + plotH - Math.max(valueH, trackH) - 6}
                  textAnchor="middle"
                  className={styles.valueLabel}
                >
                  {d.valueLabel}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={height - 6}
                textAnchor="middle"
                className={`${styles.axisText} ${d.emphasis ? styles.axisEmphasis : ''}`}
              >
                {d.label}
              </text>
            </g>
          );
        })}

        {reference && reference.value > 0 && (
          <g className={styles.reference}>
            <line x1={LEFT} x2={width} y1={yOf(reference.value)} y2={yOf(reference.value)} />
            <text x={width} y={yOf(reference.value) - 5} textAnchor="end">
              {reference.label}
            </text>
          </g>
        )}
      </svg>

      {hover !== null && (
        <div className={styles.tooltip} style={{ left: LEFT + slot * (hover + 0.5) }} role="status">
          {data[hover].tooltip}
        </div>
      )}

      <table className="visually-hidden">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{d.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
