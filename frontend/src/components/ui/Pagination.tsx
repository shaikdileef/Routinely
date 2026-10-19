import type { PageMeta } from '@planner/shared';
import styles from '../../pages/Pages.module.css';
import { Button } from './Button';

export function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  if (meta.total <= meta.pageSize) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <span>
        {from}–{to} of {meta.total}
      </span>
      <div>
        <Button size="sm" onClick={() => onPage(meta.page - 1)} disabled={meta.page <= 1}>
          Previous
        </Button>
        <Button
          size="sm"
          onClick={() => onPage(meta.page + 1)}
          disabled={meta.page >= meta.totalPages}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
