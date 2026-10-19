import { useState, type ReactNode } from 'react';
import { useEntranceProgress } from '../../hooks/useEntranceProgress';
import styles from './Charts.module.css';

export interface PieSegment {
  key: string;
  label: string;
  value: number;
  /** Any CSS colour, including var(--token). */
  color: string;
}

interface PieChartProps {
  segments: PieSegment[];
  /** Short summary for screen readers, e.g. "Open tasks by category". */
  label: string;
  /** "donut" leaves a hole for the centre figure; "pie" is a full disc. */
  variant?: 'pie' | 'donut';
  /** Donut centre: a number that counts up on entrance, and a caption under it. */
  centerValue?: number;
  centerLabel?: string;
  /** Shown instead of the chart when every value is zero. */
  empty: ReactNode;
  size?: number;
}

const GAP = 2;
const HOVER_LIFT = 4;

function polar(cx: number, cy: number, r: number, angle: number) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
}

/** SVG path for one slice between two angles (radians, 0 = 12 o'clock, clockwise). */
function slicePath(cx: number, cy: number, outer: number, inner: number, a0: number, a1: number) {
  const start = a0 - Math.PI / 2;
  const end = a1 - Math.PI / 2;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, outer, start);
  const [x1, y1] = polar(cx, cy, outer, end);
  if (inner === 0) {
    return `M${cx},${cy} L${x0},${y0} A${outer},${outer} 0 ${large} 1 ${x1},${y1} Z`;
  }
  const [x2, y2] = polar(cx, cy, inner, end);
  const [x3, y3] = polar(cx, cy, inner, start);
  return `M${x0},${y0} A${outer},${outer} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${inner},${inner} 0 ${large} 0 ${x3},${y3} Z`;
}

const percent = (value: number, total: number) => Math.round((value / total) * 100);

/**
 * Part-to-whole chart (pie or donut) with a legend, hover details and an accessible table.
 * Slices are separated by a thin surface-coloured gap; hovering one lifts it out slightly.
 */
export function PieChart({
  segments,
  label,
  variant = 'donut',
  centerValue,
  centerLabel,
  empty,
  size = 148,
}: PieChartProps) {
  const [hover, setHover] = useState<string | null>(null);
  // Slices sweep in clockwise from 12 o'clock on first show.
  const entrance = useEntranceProgress();
  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) return <div className={styles.emptyChart}>{empty}</div>;

  const c = size / 2;
  const outer = c - HOVER_LIFT - 1;
  const inner = variant === 'donut' ? outer * 0.62 : 0;
  const hovered = visible.find((s) => s.key === hover);
  const fullCircle = Math.PI * 2 * entrance;

  let angle = 0;
  const slices = visible.map((s) => {
    const sweep = (s.value / total) * fullCircle;
    const slice = { ...s, a0: angle, a1: angle + sweep };
    angle += sweep;
    return slice;
  });

  return (
    <div className={styles.pieLayout}>
      <div className={styles.pieFigure} style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden
          onMouseLeave={() => setHover(null)}
        >
          {slices.length === 1 && entrance === 1 ? (
            // A finished single 100% slice can't be drawn as an arc; use a ring/disc instead.
            <g onMouseEnter={() => setHover(slices[0].key)}>
              <circle cx={c} cy={c} r={outer} fill={slices[0].color} />
              {inner > 0 && <circle cx={c} cy={c} r={inner} className={styles.pieHole} />}
            </g>
          ) : (
            slices.map((s) => {
              const mid = (s.a0 + s.a1) / 2 - Math.PI / 2;
              const lift = hover === s.key ? HOVER_LIFT : 0;
              return (
                <path
                  key={s.key}
                  d={slicePath(c, c, outer, inner, s.a0, s.a1)}
                  fill={s.color}
                  className={`${styles.slice} ${hover && hover !== s.key ? styles.sliceDimmed : ''}`}
                  style={{
                    strokeWidth: GAP,
                    transform: `translate(${Math.cos(mid) * lift}px, ${Math.sin(mid) * lift}px)`,
                  }}
                  onMouseEnter={() => setHover(s.key)}
                />
              );
            })
          )}
        </svg>
        {variant === 'donut' && (
          <div className={styles.pieCenter}>
            {hovered ? (
              <>
                <strong>{hovered.value}</strong>
                <span>{hovered.label}</span>
              </>
            ) : (
              centerValue !== undefined && (
                <>
                  <strong>{Math.round(centerValue * entrance)}</strong>
                  {centerLabel && <span>{centerLabel}</span>}
                </>
              )
            )}
          </div>
        )}
        {variant === 'pie' && hovered && (
          <div className={styles.pieTooltip} role="status">
            <strong>
              {hovered.value} · {percent(hovered.value, total)}%
            </strong>
            <span>{hovered.label}</span>
          </div>
        )}
      </div>

      <ul className={styles.legend}>
        {slices.map((s) => (
          <li
            key={s.key}
            className={hover && hover !== s.key ? styles.legendDimmed : ''}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
          >
            <i style={{ background: s.color }} aria-hidden />
            <span className={styles.legendLabel}>{s.label}</span>
            <span className={styles.legendValue}>
              {s.value}
              <small>{percent(s.value, total)}%</small>
            </span>
          </li>
        ))}
      </ul>

      <table className="visually-hidden">
        <caption>{label}</caption>
        <tbody>
          {slices.map((s) => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              <td>
                {s.value} ({percent(s.value, total)}%)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
