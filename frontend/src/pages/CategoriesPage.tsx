import { categoryCreateSchema, COLOR_PALETTE, type Category } from '@planner/shared';
import { FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError, errorMessage } from '../api/client';
import { Button, IconButton } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { ColorPicker } from '../components/ui/ColorPicker';
import { EmptyState, ErrorState, LoadingState, ProgressBar } from '../components/ui/Feedback';
import { Field, FormError, formStyles, Select, TextInput } from '../components/ui/Form';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '../hooks/queries';
import { pluralize } from '../lib/format';
import styles from './CategoriesPage.module.css';
import pageStyles from './Pages.module.css';

export function CategoriesPage() {
  const categories = useCategories();
  const [editing, setEditing] = useState<{ category?: Category } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Group tasks by project or area of life"
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing({})}>
            New category
          </Button>
        }
      />
      {categories.isPending ? (
        <LoadingState />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
      ) : categories.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderOpen}
            title="No categories yet"
            description="Create categories such as Work, Personal or Learning, then assign tasks to them."
            action={
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing({})}>
                Create a category
              </Button>
            }
          />
        </Card>
      ) : (
        <div className={pageStyles.cardGrid}>
          {categories.data.map((c) => {
            const open = c.taskCount - c.completedCount;
            const pct = c.taskCount === 0 ? 0 : (c.completedCount / c.taskCount) * 100;
            return (
              <article key={c.id} className={styles.card}>
                <header className={styles.header}>
                  <span className={styles.swatch} style={{ background: c.color }} aria-hidden />
                  <h2 className={styles.name}>{c.name}</h2>
                  <IconButton label={`Edit ${c.name}`} onClick={() => setEditing({ category: c })}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton
                    label={`Delete ${c.name}`}
                    variant="danger"
                    onClick={() => setDeleting(c)}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </header>
                <div className={styles.counts}>
                  <span>
                    <strong>{open}</strong> open
                  </span>
                  <span>
                    <strong>{c.completedCount}</strong> completed
                  </span>
                  <span>{Math.round(pct)}%</span>
                </div>
                <ProgressBar value={pct} label={`${c.name} completion`} />
                <Link to={`/tasks?categoryId=${c.id}`} className={pageStyles.cardLink}>
                  View {pluralize(c.taskCount, 'task')}
                </Link>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <CategoryFormModal category={editing.category} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <DeleteCategoryModal
          category={deleting}
          others={(categories.data ?? []).filter((c) => c.id !== deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function CategoryFormModal({ category, onClose }: { category?: Category; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState<string>(category?.color ?? COLOR_PALETTE[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = categoryCreateSchema.safeParse({ name, color });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      if (category) await update.mutateAsync({ id: category.id, input: parsed.data });
      else await create.mutateAsync(parsed.data);
      toast.success(category ? 'Category updated' : 'Category created');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    }
  }

  return (
    <Modal
      open
      size="sm"
      title={category ? 'Edit category' : 'New category'}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="category-form" loading={saving}>
            {category ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form id="category-form" className={formStyles.stack} onSubmit={onSubmit} noValidate>
        <FormError message={formError} />
        <Field label="Name" error={errors.name}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            data-autofocus
          />
        </Field>
        <ColorPicker value={color} onChange={setColor} error={errors.color} />
      </form>
    </Modal>
  );
}

/** Deleting never removes tasks: they are moved to another category or left uncategorized. */
function DeleteCategoryModal({
  category,
  others,
  onClose,
}: {
  category: Category;
  others: Category[];
  onClose: () => void;
}) {
  const toast = useToast();
  const remove = useDeleteCategory();
  const [target, setTarget] = useState('none');
  const [error, setError] = useState<string | null>(null);
  const hasTasks = category.taskCount > 0;

  async function onConfirm() {
    setError(null);
    try {
      const { movedTasks } = await remove.mutateAsync({
        id: category.id,
        reassignTo: hasTasks ? target : undefined,
      });
      toast.success(
        movedTasks > 0
          ? `Category deleted · ${pluralize(movedTasks, 'task')} moved`
          : 'Category deleted',
      );
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      open
      size="sm"
      title={`Delete "${category.name}"?`}
      onClose={onClose}
      busy={remove.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={remove.isPending} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={remove.isPending}>
            Delete category
          </Button>
        </>
      }
    >
      <div className={formStyles.stack}>
        <FormError message={error} />
        {hasTasks ? (
          <>
            <p>
              This category has {pluralize(category.taskCount, 'task')}. Tasks are never deleted
              with a category. Choose where they should go:
            </p>
            <Field label="Move tasks to">
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="none">No category (uncategorized)</option>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <p>This category has no tasks. It will be removed permanently.</p>
        )}
      </div>
    </Modal>
  );
}
