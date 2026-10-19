import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  LayoutDashboard,
  ListTodo,
  Repeat,
  Settings,
  Sun,
  Tags,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'My Tasks', icon: ListTodo },
  { to: '/today', label: 'Today', icon: Sun },
  { to: '/upcoming', label: 'Upcoming', icon: CalendarRange },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/completed', label: 'Completed', icon: CheckCircle2 },
  { to: '/habits', label: 'Habits', icon: Repeat },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/settings', label: 'Settings', icon: Settings },
];
