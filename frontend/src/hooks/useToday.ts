import { minutesInTimeZone, todayInTimeZone } from '@planner/shared';
import { useEffect, useState } from 'react';
import { useSession } from '../context/AuthContext';

/** Today's date (and minutes past midnight) in the user's timezone; updates across midnight. */
export function useToday() {
  const { timezone } = useSession().settings;
  const compute = () => {
    const now = new Date();
    return {
      today: todayInTimeZone(timezone, now),
      minutes: minutesInTimeZone(now, timezone),
      timezone,
    };
  };
  const [state, setState] = useState(compute);

  useEffect(() => {
    setState(compute());
    const id = window.setInterval(() => setState(compute()), 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone]);

  return state.timezone === timezone ? state : compute();
}
