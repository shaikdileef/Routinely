import type { Task } from '@planner/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { TaskFormModal, type TaskDraft } from '../components/tasks/TaskFormModal';

interface EditorState {
  key: number;
  task?: Task;
  defaults?: Partial<TaskDraft>;
}

interface TaskEditorApi {
  openNew: (defaults?: Partial<TaskDraft>) => void;
  openTask: (task: Task) => void;
}

const TaskEditorContext = createContext<TaskEditorApi | null>(null);

/** One shared task editor so any page (or the calendar) can open it. */
export function TaskEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState | null>(null);
  const close = useCallback(() => setState(null), []);
  const api = useMemo<TaskEditorApi>(
    () => ({
      openNew: (defaults) => setState({ key: Date.now(), defaults }),
      openTask: (task) => setState({ key: Date.now(), task }),
    }),
    [],
  );
  return (
    <TaskEditorContext.Provider value={api}>
      {children}
      {state && (
        <TaskFormModal
          key={state.key}
          task={state.task}
          defaults={state.defaults}
          onClose={close}
        />
      )}
    </TaskEditorContext.Provider>
  );
}

export function useTaskEditor(): TaskEditorApi {
  const ctx = useContext(TaskEditorContext);
  if (!ctx) throw new Error('useTaskEditor must be used inside TaskEditorProvider');
  return ctx;
}
