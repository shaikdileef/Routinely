import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { ErrorState, LoadingState } from './components/ui/Feedback';
import { useAuth } from './context/AuthContext';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { CalendarPage } from './pages/CalendarPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { CompletedPage } from './pages/CompletedPage';
import { DashboardPage } from './pages/DashboardPage';
import { HabitsPage } from './pages/HabitsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';
import { TodayPage } from './pages/TodayPage';
import { UpcomingPage } from './pages/UpcomingPage';

function SessionGate({ children }: { children: ReactNode }) {
  const { loading, error, retry } = useAuth();
  if (loading) return <LoadingState label="Loading your planner…" />;
  if (error) {
    return (
      <div style={{ maxWidth: 480, margin: '15vh auto', padding: 16 }}>
        <ErrorState error={error} onRetry={retry} />
      </div>
    );
  }
  return <>{children}</>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (session) return <Navigate to={from} replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <SessionGate>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <LoginPage />
            </GuestOnly>
          }
        />
        <Route
          path="/register"
          element={
            <GuestOnly>
              <RegisterPage />
            </GuestOnly>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="upcoming" element={<UpcomingPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="completed" element={<CompletedPage />} />
          <Route path="habits" element={<HabitsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </SessionGate>
  );
}
