import { PRIORITIES, PRIORITY_LABELS, STATUS_LABELS, TASK_STATUSES } from '@planner/shared';
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCategories } from '../../hooks/queries';
import { Button } from '../ui/Button';
import { Select } from '../ui/Form';
import styles from './TaskFilters.module.css';

export type FilterKey = 'search' | 'view' | 'status' | 'priority' | 'categoryId' | 'sort' | 'order';

interface TaskFiltersProps {
  values: Partial<Record<FilterKey, string>>;
  onChange: (patch: Partial<Record<FilterKey, string>>) => void;
  /** Which controls to show. */
  show?: FilterKey[];
}

const ALL: FilterKey[] = ['search', 'view', 'status', 'priority', 'categoryId', 'sort'];

const VIEW_OPTIONS = [
  { value: '', label: 'Any date' },
  { value: 'today', label: 'Due today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'nodate', label: 'No due date' },
  { value: 'open', label: 'All open' },
  { value: 'completed', label: 'Completed' },
];

const SORT_OPTIONS = [
  { value: '', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'createdAt', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
];

/** Filter bar bound to URL params by the parent, so filters survive reloads and links. */
export function TaskFilters({ values, onChange, show = ALL }: TaskFiltersProps) {
  const categories = useCategories();
  const [search, setSearch] = useState(values.search ?? '');

  useEffect(() => setSearch(values.search ?? ''), [values.search]);

  // Debounce typing into the URL.
  useEffect(() => {
    if ((values.search ?? '') === search) return;
    const id = window.setTimeout(() => onChange({ search }), 300);
    return () => window.clearTimeout(id);
  }, [search, values.search, onChange]);

  const has = (k: FilterKey) => show.includes(k);
  const active = show.some((k) => k !== 'sort' && values[k]);
  const sortValue = values.sort ? `${values.sort}${values.order === 'asc' ? ':asc' : ''}` : '';

  return (
    <div className={styles.bar} role="search">
      {has('search') && (
        <div className={styles.search}>
          <Search size={16} aria-hidden className={styles.searchIcon} />
          <input
            type="search"
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description, tags…"
            aria-label="Search tasks"
          />
        </div>
      )}
      {has('view') && (
        <Select
          aria-label="Date filter"
          value={values.view ?? ''}
          onChange={(e) => onChange({ view: e.target.value })}
        >
          {VIEW_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
      {has('status') && (
        <Select
          aria-label="Status filter"
          value={values.status ?? ''}
          onChange={(e) => onChange({ status: e.target.value })}
        >
          <option value="">Any status</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      )}
      {has('priority') && (
        <Select
          aria-label="Priority filter"
          value={values.priority ?? ''}
          onChange={(e) => onChange({ priority: e.target.value })}
        >
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
      )}
      {has('categoryId') && (
        <Select
          aria-label="Category filter"
          value={values.categoryId ?? ''}
          onChange={(e) => onChange({ categoryId: e.target.value })}
        >
          <option value="">Any category</option>
          <option value="none">No category</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}
      {has('sort') && (
        <Select
          aria-label="Sort by"
          value={sortValue}
          onChange={(e) => {
            const [sort = '', order = ''] = e.target.value.split(':');
            onChange({ sort, order });
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Sort: {o.label}
            </option>
          ))}
        </Select>
      )}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          icon={<X size={14} />}
          onClick={() => {
            setSearch('');
            onChange(Object.fromEntries(show.filter((k) => k !== 'sort').map((k) => [k, ''])));
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
