import { useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { NAV_ITEMS } from './navItems';
import styles from './HeaderNav.module.css';

interface Indicator {
  left: number;
  width: number;
}

/**
 * The app's pages as tabs in the header. A glossy pill slides to the active tab; on narrow
 * screens the row scrolls sideways and keeps the active tab in view.
 */
export function HeaderNav() {
  const location = useLocation();
  const listRef = useRef<HTMLUListElement>(null);
  const [indicator, setIndicator] = useState<Indicator | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const active = list.querySelector<HTMLElement>('[aria-current="page"]');
      setIndicator(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
    };
    measure();
    list
      .querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [location.pathname]);

  return (
    <nav className={styles.nav} aria-label="Main navigation">
      <ul ref={listRef} className={styles.list}>
        {indicator && (
          <li
            className={styles.indicator}
            style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
            aria-hidden
          />
        )}
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
              <Icon size={16} aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
