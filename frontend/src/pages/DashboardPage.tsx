import type { DashboardInsights } from '@planner/shared';
import { ArrowRight, ClipboardList, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  formatAverage,
  WeeklyTrendChart,
  WeekPlanChart,
} from '../components/dashboard/InsightCharts';
import { DailyTasksCard } from '../components/dashboard/DailyTasksCard';
import { GaugeChart } from '../components/dashboard/GaugeChart';
import { PieChart } from '../components/dashboard/PieChart';
import { SpotifyCard } from '../components/dashboard/SpotifyCard';
import dash from '../components/dashboard/Dashboard.module.css';
import { QuickAdd } from '../components/tasks/QuickAdd';
import { TaskList } from '../components/tasks/TaskList';
import { DueBadge } from '../components/ui/Badges';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { useSession } from '../context/AuthContext';
import { useTaskEditor } from '../context/TaskEditorContext';
import { useDashboard } from '../hooks/queries';
import { useToday } from '../hooks/useToday';
import { formatDate, greeting } from '../lib/format';
import styles from './Pages.module.css';

export function DashboardPage() {
  const { user } = useSession();
  const { today, minutes } = useToday();
  const editor = useTaskEditor();
  const dashboard = useDashboard();
  const firstName = user.name.split(' ')[0];

  return (
    <div className={styles.stack}>
      <div className={dash.hero}>
        <div>
          <h1>
            {greeting(minutes)}, {firstName}
          </h1>
          <p className={dash.heroDate}>{formatDate(today, 'long')}</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={16} />}
          onClick={() => editor.openNew({ dueDate: today })}
        >
          New task
        </Button>
      </div>

      <QuickAdd dueDate={today} placeholder="Quick add a task for today…" />

      <div className={styles.board}>
        {/* Repeating tasks first, apart from one-off tasks; shown even before any task exists. */}
        <div className={`${styles.wide} ${styles.column}`}>
          <DailyTasksCard today={today} />
        </div>
        <div className={`${styles.narrow} ${styles.column}`}>
          <SpotifyCard />
        </div>

        {dashboard.isPending ? (
          <div className={styles.full}>
            <LoadingState />
          </div>
        ) : dashboard.isError ? (
          <div className={styles.full}>
            <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
          </div>
        ) : dashboard.data.totals.all === 0 ? (
          <Card className={styles.full}>
            <EmptyState
              icon={Sparkles}
              title="Welcome to Routinely"
              description="You don't have any tasks yet. Add your first task above or open the full form to set dates, priority and a category."
              action={
                <Button
                  variant="primary"
                  icon={<Plus size={16} />}
                  onClick={() => editor.openNew({ dueDate: today })}
                >
                  Create your first task
                </Button>
              }
            />
          </Card>
        ) : (
          <DashboardContent data={dashboard.data} today={today} />
        )}
      </div>
    </div>
  );
}

function DashboardContent({
  data,
  today,
}: {
  data: NonNullable<ReturnType<typeof useDashboard>['data']>;
  today: string;
}) {
  const editor = useTaskEditor();
  const { todayProgress: tp, openStatus, insights } = data;
  const openTotal = openStatus.todo + openStatus.inProgress + openStatus.overdue;
  const weekSummary = [
    `${data.completedLast7Days} done in the last 7 days`,
    `about ${formatAverage(insights.averagePerDay)} a day`,
    insights.onTimeRate !== null && `${insights.onTimeRate}% on time`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {/* Gauge: one value moving towards a goal. */}
      <Card
        className={styles.third}
        title="Today's progress"
        action={
          <Link to="/today" className={styles.cardLink}>
            Today <ArrowRight size={14} aria-hidden />
          </Link>
        }
      >
        <GaugeChart
          value={tp.percent}
          label="Today's progress"
          detail={tp.total === 0 ? 'Nothing due today' : `${tp.completed} of ${tp.total} done`}
        />
      </Card>

      {/* Donut: three parts of one whole, with the total in the hole. */}
      <Card
        className={styles.third}
        title="Open tasks"
        action={
          openStatus.overdue > 0 ? (
            <Link to="/tasks?view=overdue" className={styles.cardLink}>
              Overdue <ArrowRight size={14} aria-hidden />
            </Link>
          ) : undefined
        }
      >
        <PieChart
          variant="donut"
          label="Open tasks by status"
          centerValue={openTotal}
          centerLabel="open"
          empty="No open tasks. All done!"
          segments={[
            {
              key: 'todo',
              label: 'To do',
              value: openStatus.todo,
              color: 'var(--chart-bar-muted)',
            },
            {
              key: 'progress',
              label: 'In progress',
              value: openStatus.inProgress,
              color: 'var(--accent)',
            },
            {
              key: 'overdue',
              label: 'Overdue',
              value: openStatus.overdue,
              color: 'var(--danger)',
            },
          ]}
        />
      </Card>

      {/* Pie: shares of open tasks across the user's own categories. */}
      <Card
        className={`${styles.third} ${styles.thirdLast}`}
        title="By category"
        action={
          <Link to="/categories" className={styles.cardLink}>
            Manage <ArrowRight size={14} aria-hidden />
          </Link>
        }
      >
        <PieChart
          variant="pie"
          label="Open tasks by category"
          empty="No open tasks to group yet."
          segments={data.openByCategory.map((c) => ({
            key: c.key,
            label: c.name,
            value: c.count,
            color:
              c.color ?? (c.key === 'other' ? 'var(--chart-neutral)' : 'var(--chart-neutral-2)'),
          }))}
        />
      </Card>

      <div className={`${styles.wide} ${styles.column}`}>
        <Card
          title="Today's tasks"
          action={
            <Link to="/today" className={styles.cardLink}>
              Open Today <ArrowRight size={14} aria-hidden />
            </Link>
          }
        >
          <TaskList
            tasks={data.todayTasks}
            showDueDate={false}
            label="Today's tasks"
            empty={
              <EmptyState
                compact
                icon={ClipboardList}
                title="Nothing due today"
                description="Use quick add above to plan something for today."
              />
            }
          />
        </Card>

        {data.overdueTasks.length > 0 && (
          <Card
            title={<span style={{ color: 'var(--danger)' }}>Overdue</span>}
            action={
              <Link to="/tasks?view=overdue" className={styles.cardLink}>
                View all {data.overdueCount} <ArrowRight size={14} aria-hidden />
              </Link>
            }
          >
            <TaskList tasks={data.overdueTasks} label="Overdue tasks" />
          </Card>
        )}
      </div>

      <div className={`${styles.narrow} ${styles.column}`}>
        <ProgressCard insights={insights} today={today} summary={weekSummary} />

        <Card
          title="Upcoming deadlines"
          action={
            <Link to="/upcoming" className={styles.cardLink}>
              All <ArrowRight size={14} aria-hidden />
            </Link>
          }
        >
          {data.upcomingTasks.length === 0 ? (
            <p className={`${styles.muted} ${styles.small}`}>No upcoming deadlines.</p>
          ) : (
            <div>
              {data.upcomingTasks.map((t) => (
                <div key={t.id} className={dash.upcomingRow}>
                  <button
                    type="button"
                    className={dash.upcomingTitle}
                    onClick={() => editor.openTask(t)}
                  >
                    {t.title}
                  </button>
                  {t.dueDate && <DueBadge dueDate={t.dueDate} status={t.status} today={today} />}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

type ProgressRange = 'week' | 'trend';

/** One chart card for progress: this week's plan, or the 8-week trend against the average. */
function ProgressCard({
  insights,
  today,
  summary,
}: {
  insights: DashboardInsights;
  today: string;
  summary: string;
}) {
  const [range, setRange] = useState<ProgressRange>('week');
  const options: { value: ProgressRange; label: string }[] = [
    { value: 'week', label: 'This week' },
    { value: 'trend', label: '8 weeks' },
  ];

  return (
    <Card
      title="Progress"
      action={
        <div className={styles.segmented} role="group" aria-label="Progress range">
          {options.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {range === 'week' ? (
        <WeekPlanChart insights={insights} today={today} />
      ) : (
        <WeeklyTrendChart insights={insights} />
      )}
      <p className={`${styles.muted} ${styles.small}`} style={{ marginTop: 10 }}>
        {summary}
      </p>
    </Card>
  );
}
