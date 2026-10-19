import { Outlet, useLocation } from 'react-router';
import { TaskEditorProvider } from '../../context/TaskEditorContext';
import styles from './AppShell.module.css';
import { Topbar } from './Topbar';

export function AppShell() {
  const location = useLocation();

  return (
    <TaskEditorProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Topbar />
      <main id="main" className={styles.content} tabIndex={-1}>
        {/* Keyed by route so each page eases in when you navigate. */}
        <div key={location.pathname} className={styles.page}>
          <Outlet />
        </div>
      </main>
    </TaskEditorProvider>
  );
}
