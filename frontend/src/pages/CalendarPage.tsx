import {
  addDays,
  addMonths,
  eachDay,
  endOfMonth,
  endOfWeek,
  isOverdue,
  isValidDateKey,
  PRIORITY_RANK,
  startOfMonth,
  startOfWeek,
  type DateKey,
  type Task,
} from '@planner/shared';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { TaskList } from '../components/tasks/TaskList';
import { Button, IconButton } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { useSession } from '../context/AuthContext';
import { useTaskEditor } from '../context/TaskEditorContext';
import { useTasks } from '../hooks/queries';
import { useToday } from '../hooks/useToday';
import { formatDate, formatTime } from '../lib/format';
import styles from './CalendarPage.module.css';
import pageStyles from './Pages.module.css';

type Mode = 'month' | 'week' | 'day';
const MODES: Mode[] = ['month', 'week', 'day'];
const MAX_CHIPS = 3;

function rangeFor(mode: Mode, date: DateKey, weekStartsOn: number): [DateKey, DateKey] {
  if (mode === 'day') return [date, date];
  if (mode === 'week') return [startOfWeek(date, weekStartsOn), endOfWeek(date, weekStartsOn)];
  return [startOfWeek(startOfMonth(date), weekStartsOn), endOfWeek(endOfMonth(date), weekStartsOn)];
}

function sortForDay(a: Task, b: Task) {
  return (
    Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED') ||
    (a.startTime ?? '99').localeCompare(b.startTime ?? '99') ||
    PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
  );
}

export function CalendarPage() {
  const { today } = useToday();
  const { weekStartsOn } = useSession().settings;
  const editor = useTaskEditor();
  const [params, setParams] = useSearchParams();

  const mode: Mode = MODES.includes(params.get('mode') as Mode)
    ? (params.get('mode') as Mode)
    : 'month';
  const rawDate = params.get('date');
  const date = rawDate && isValidDateKey(rawDate) ? rawDate : today;
  const [from, to] = rangeFor(mode, date, weekStartsOn);

  const tasks = useTasks({ view: 'all', from, to, sort: 'dueDate', pageSize: 500 });

  const byDate = useMemo(() => {
    const map = new Map<DateKey, Task[]>();
    for (const t of tasks.data?.data ?? []) {
      if (!t.dueDate) continue;
      map.set(t.dueDate, [...(map.get(t.dueDate) ?? []), t]);
    }
    for (const list of map.values()) list.sort(sortForDay);
    return map;
  }, [tasks.data]);

  const go = (next: { mode?: Mode; date?: DateKey }) =>
    setParams({ mode: next.mode ?? mode, date: next.date ?? date }, { replace: true });

  const step = (dir: 1 | -1) =>
    go({
      date:
        mode === 'month' ? addMonths(date, dir) : addDays(date, mode === 'week' ? 7 * dir : dir),
    });

  const title =
    mode === 'month'
      ? formatDate(date, 'monthYear')
      : mode === 'week'
        ? `${formatDate(from, 'short')} – ${formatDate(to, 'shortWithYear')}`
        : formatDate(date, 'long');

  const weekdayHeaders = eachDay(from, addDays(from, 6)).map((d) => formatDate(d, 'weekdayNarrow'));
  const addFor = (d: DateKey) => editor.openNew({ dueDate: d });

  return (
    <>
      <PageHeader
        title="Calendar"
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => addFor(mode === 'day' ? date : today)}
          >
            New task
          </Button>
        }
      />
      <Card padded={false}>
        <div className={styles.toolbar}>
          <div className={styles.nav}>
            <IconButton label={`Previous ${mode}`} onClick={() => step(-1)}>
              <ChevronLeft size={18} />
            </IconButton>
            <IconButton label={`Next ${mode}`} onClick={() => step(1)}>
              <ChevronRight size={18} />
            </IconButton>
            <Button size="sm" onClick={() => go({ date: today })}>
              Today
            </Button>
            <h2 className={styles.title} aria-live="polite">
              {title}
            </h2>
          </div>
          <div className={pageStyles.segmented} role="group" aria-label="Calendar view">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => go({ mode: m })}
              >
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {tasks.isError && (
          <div style={{ padding: 16 }}>
            <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />
          </div>
        )}
        {tasks.isPending ? (
          <LoadingState />
        ) : mode === 'month' ? (
          <div className={styles.month}>
            <div className={styles.weekdays} aria-hidden>
              {weekdayHeaders.map((w) => (
                <div key={w} className={styles.weekday}>
                  {w}
                </div>
              ))}
            </div>
            <div className={styles.monthGrid}>
              {eachDay(from, to).map((d) => {
                const list = byDate.get(d) ?? [];
                const outside = d.slice(0, 7) !== date.slice(0, 7);
                return (
                  <div
                    key={d}
                    className={[styles.cell, outside && styles.outside, d === today && styles.today]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => addFor(d)}
                  >
                    <div className={styles.cellHeader}>
                      <button
                        type="button"
                        className={styles.dayNumber}
                        onClick={(e) => {
                          e.stopPropagation();
                          go({ mode: 'day', date: d });
                        }}
                        aria-label={`Open ${formatDate(d, 'long')}${list.length ? `, ${list.length} tasks` : ''}`}
                      >
                        {formatDate(d, 'dayNumber')}
                      </button>
                      <button
                        type="button"
                        className={styles.addButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          addFor(d);
                        }}
                        aria-label={`Add task on ${formatDate(d, 'long')}`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className={styles.chips}>
                      {list.slice(0, MAX_CHIPS).map((t) => (
                        <TaskChip
                          key={t.id}
                          task={t}
                          today={today}
                          onOpen={() => editor.openTask(t)}
                        />
                      ))}
                      {list.length > MAX_CHIPS && (
                        <button
                          type="button"
                          className={styles.more}
                          onClick={(e) => {
                            e.stopPropagation();
                            go({ mode: 'day', date: d });
                          }}
                        >
                          +{list.length - MAX_CHIPS} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : mode === 'week' ? (
          <div className={styles.week}>
            {eachDay(from, to).map((d) => {
              const list = byDate.get(d) ?? [];
              return (
                <section
                  key={d}
                  className={`${styles.weekCol} ${d === today ? styles.today : ''}`}
                  aria-label={formatDate(d, 'long')}
                >
                  <header className={styles.weekHeader}>
                    <button
                      type="button"
                      className={styles.weekDay}
                      onClick={() => go({ mode: 'day', date: d })}
                    >
                      <span>{formatDate(d, 'weekdayNarrow')}</span>
                      <strong>{formatDate(d, 'dayNumber')}</strong>
                    </button>
                    <IconButton
                      label={`Add task on ${formatDate(d, 'long')}`}
                      onClick={() => addFor(d)}
                    >
                      <Plus size={16} />
                    </IconButton>
                  </header>
                  <div className={styles.weekList}>
                    {list.map((t) => (
                      <TaskChip
                        key={t.id}
                        task={t}
                        today={today}
                        onOpen={() => editor.openTask(t)}
                        showTime
                      />
                    ))}
                    {list.length === 0 && <span className={styles.emptyDay}>No tasks</span>}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className={styles.day}>
            {(byDate.get(date) ?? []).length === 0 ? (
              <EmptyState
                icon={Plus}
                title="Nothing scheduled"
                description={`No tasks are due on ${formatDate(date, 'long')}.`}
                action={
                  <Button variant="primary" icon={<Plus size={16} />} onClick={() => addFor(date)}>
                    Add a task
                  </Button>
                }
              />
            ) : (
              <TaskList
                tasks={byDate.get(date) ?? []}
                showDueDate={false}
                label={`Tasks on ${formatDate(date, 'long')}`}
              />
            )}
          </div>
        )}
      </Card>
      <p className={`${pageStyles.muted} ${pageStyles.small}`} style={{ marginTop: 10 }}>
        Tasks appear on their due date. Tasks without a due date are listed under Upcoming.
      </p>
    </>
  );
}

function TaskChip({
  task,
  today,
  onOpen,
  showTime,
}: {
  task: Task;
  today: DateKey;
  onOpen: () => void;
  showTime?: boolean;
}) {
  const done = task.status === 'COMPLETED';
  const overdue = isOverdue(task, today);
  return (
    <button
      type="button"
      className={[styles.chip, done && styles.chipDone, overdue && styles.chipOverdue]
        .filter(Boolean)
        .join(' ')}
      style={{ borderLeftColor: task.category?.color ?? 'var(--accent)' }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={task.title}
    >
      {showTime && task.startTime && (
        <span className={styles.chipTime}>{formatTime(task.startTime)}</span>
      )}
      {!showTime && task.startTime && <span className={styles.chipTime}>{task.startTime}</span>}
      <span className={styles.chipTitle}>{task.title}</span>
      {done && <span className="visually-hidden"> (completed)</span>}
      {overdue && <span className="visually-hidden"> (overdue)</span>}
    </button>
  );
}
