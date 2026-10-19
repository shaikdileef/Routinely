import { dateKeyInTimeZone, type Task, type TaskQueryInput } from '@planner/shared';
import { CheckCircle2, SearchX } from 'lucide-react';
import { TaskFilters, type FilterKey } from '../components/tasks/TaskFilters';
import { TaskGroup, TaskList } from '../components/tasks/TaskList';
import { Card, PageHeader } from '../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { Pagination } from '../components/ui/Pagination';
import { useTasks } from '../hooks/queries';
import { useToday } from '../hooks/useToday';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { formatDate, pluralize, relativeDay } from '../lib/format';

const FILTER_KEYS: FilterKey[] = ['search', 'priority', 'categoryId'];

export function CompletedPage() {
  const { today, timezone } = useToday();
  const { values, update, page, setPage } = useUrlFilters(FILTER_KEYS);
  const tasks = useTasks({
    ...(values as Partial<TaskQueryInput>),
    view: 'completed',
    sort: 'completedAt',
    page,
    pageSize: 30,
  });
  const filtered = Object.values(values).some(Boolean);

  const groups = new Map<string, Task[]>();
  for (const t of tasks.data?.data ?? []) {
    const day = t.completedAt ? dateKeyInTimeZone(new Date(t.completedAt), timezone) : 'unknown';
    groups.set(day, [...(groups.get(day) ?? []), t]);
  }

  return (
    <>
      <PageHeader
        title="Completed"
        subtitle={tasks.data ? `${pluralize(tasks.data.meta.total, 'completed task')}` : undefined}
      />
      <Card>
        <TaskFilters values={values} onChange={update} show={FILTER_KEYS} />
        <div style={{ marginTop: 16 }}>
          {tasks.isPending ? (
            <LoadingState />
          ) : tasks.isError ? (
            <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />
          ) : tasks.data.data.length === 0 ? (
            filtered ? (
              <EmptyState icon={SearchX} title="No matching completed tasks" />
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="Nothing completed yet"
                description="Tasks you check off will be kept here, so you can review or reopen them."
              />
            )
          ) : (
            <>
              {[...groups.entries()].map(([day, list]) => (
                <TaskGroup
                  key={day}
                  count={list.length}
                  title={
                    day === 'unknown'
                      ? 'Earlier'
                      : `${relativeDay(day, today)} · ${formatDate(day, 'shortWithYear')}`
                  }
                >
                  <TaskList tasks={list} variant="completed" label={`Completed ${day}`} />
                </TaskGroup>
              ))}
              <Pagination meta={tasks.data.meta} onPage={setPage} />
            </>
          )}
        </div>
      </Card>
    </>
  );
}
