import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/** Reads/writes a set of filter values in the URL query string. Changing a filter resets `page`. */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const out: Partial<Record<K, string>> = {};
    for (const k of keys) {
      const v = params.get(k);
      if (v) out[k] = v;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, keys.join(',')]);

  const page = Math.max(1, Number(params.get('page')) || 1);

  const update = useCallback(
    (patch: Partial<Record<K | 'page', string>>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch) as [string, string | undefined][]) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setPage = useCallback(
    (p: number) => update({ page: p > 1 ? String(p) : '' } as Partial<Record<K | 'page', string>>),
    [update],
  );

  return { values, update, page, setPage };
}
