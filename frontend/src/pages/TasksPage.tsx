import type { TaskQueryInput } from '@planner/shared';
import { ListTodo, Plus, SearchX } from 'lucide-react';
import { useEffect } from 'react';
import { TaskFilters, type FilterKey } from '../components/tasks/TaskFilters';
import { TaskList } from '../components/tasks/TaskList';
import { Button } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { Pagination } from '../components/ui/Pagination';
import { useTaskEditor } from '../context/TaskEditorContext';
import { useTasks } from '../hooks/queries';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { pluralize } from '../lib/format';

const FILTER_KEYS: FilterKey[] = [
  'search',
  'view',
  'status',
  'priority',
  'categoryId',
  'sort',
  'order',
];
const PAGE_SIZE = 25;

export function TasksPage() {
  const editor = useTaskEditor();
  const { values, update, page, setPage } = useUrlFilters(FILTER_KEYS);

  const query = { ...values, page, pageSize: PAGE_SIZE } as TaskQueryInput;
  const tasks = useTasks(query);
  const filtered = Object.entries(values).some(([k, v]) => k !== 'sort' && k !== 'order' && v);

  // If filters shrink the result set below the current page, go back to the last page.
  const totalPages = tasks.data?.meta.totalPages;
  useEffect(() => {
    if (totalPages && page > totalPages) setPage(totalPages);
  }, [page, totalPages, setPage]);

  return (
    <>
      <PageHeader
        title="My Tasks"
        subtitle={
          tasks.data
            ? pluralize(tasks.data.meta.total, filtered ? 'matching task' : 'task')
            : undefined
        }
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => editor.openNew()}>
            New task
          </Button>
        }
      />
      <Card>
        <TaskFilters values={values} onChange={update} />
        <div style={{ marginTop: 14 }} aria-busy={tasks.isFetching}>
          {tasks.isPending ? (
            <LoadingState />
          ) : tasks.isError ? (
            <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />
          ) : (
            <>
              <TaskList
                tasks={tasks.data.data}
                label="Tasks"
                empty={
                  filtered ? (
                    <EmptyState
                      icon={SearchX}
                      title="No matching tasks"
                      description="Try a different search or clear the filters."
                    />
                  ) : (
                    <EmptyState
                      icon={ListTodo}
                      title="No tasks yet"
                      description="Create a task to get started."
                      action={
                        <Button
                          variant="primary"
                          icon={<Plus size={16} />}
                          onClick={() => editor.openNew()}
                        >
                          New task
                        </Button>
                      }
                    />
                  )
                }
              />
              <Pagination meta={tasks.data.meta} onPage={setPage} />
            </>
          )}
        </div>
      </Card>
    </>
  );
}
