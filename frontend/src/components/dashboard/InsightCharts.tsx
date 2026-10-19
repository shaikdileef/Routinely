import { addDays, type DashboardInsights, type DateKey } from '@planner/shared';
import { formatDate, pluralize } from '../../lib/format';
import { BarChart } from './BarChart';
import styles from './Dashboard.module.css';

/** One decimal place, without a trailing ".0". */
export function formatAverage(value: number) {
  return String(Math.round(value * 10) / 10);
}

function weekRange(weekStart: DateKey) {
  return `${formatDate(weekStart, 'short')} – ${formatDate(addDays(weekStart, 6), 'short')}`;
}

/** Completions per calendar week for the last 8 weeks, against the weekly average. */
export function WeeklyTrendChart({ insights }: { insights: DashboardInsights }) {
  const { weeks, weeklyAverage } = insights;
  return (
    <BarChart
      label="Tasks completed per week, last 8 weeks"
      reference={{ value: weeklyAverage, label: `avg ${formatAverage(weeklyAverage)} / week` }}
      data={weeks.map((w) => ({
        key: w.weekStart,
        label: w.partial ? 'This wk' : formatDate(w.weekStart, 'short'),
        value: w.completed,
        muted: w.partial,
        emphasis: w.partial,
        valueLabel: String(w.completed),
        description: `${weekRange(w.weekStart)}: ${pluralize(w.completed, 'task')} completed${w.partial ? ' so far' : ''}`,
        tooltip: (
          <>
            <strong>
              {pluralize(w.completed, 'task')}
              {w.partial && ' so far'}
            </strong>
            <span>{weekRange(w.weekStart)}</span>
          </>
        ),
      }))}
    />
  );
}

/** Each day of the current week: tasks due (track) and how many of them are done (bar). */
export function WeekPlanChart({
  insights,
  today,
}: {
  insights: DashboardInsights;
  today: DateKey;
}) {
  return (
    <>
      <BarChart
        label="Tasks planned and done each day this week"
        height={150}
        data={insights.thisWeek.map((d) => ({
          key: d.date,
          label: d.date === today ? 'Today' : formatDate(d.date, 'weekdayNarrow'),
          value: d.done,
          track: d.planned,
          emphasis: d.date === today,
          valueLabel: d.planned > 0 ? `${d.done}/${d.planned}` : undefined,
          description:
            d.planned === 0
              ? `${formatDate(d.date, 'weekdayShort')}: nothing due`
              : `${formatDate(d.date, 'weekdayShort')}: ${d.done} of ${pluralize(d.planned, 'task')} done`,
          tooltip: (
            <>
              <strong>{d.planned === 0 ? 'Nothing due' : `${d.done} of ${d.planned} done`}</strong>
              <span>{formatDate(d.date, 'weekdayShort')}</span>
            </>
          ),
        }))}
      />
      <div className={styles.legend}>
        <span>
          <i className={styles.legendTrack} aria-hidden /> Due
        </span>
        <span>
          <i className={styles.legendBar} aria-hidden /> Done
        </span>
      </div>
    </>
  );
}
