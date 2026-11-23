import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { get } from './api';
import { useToast } from '../components/ui';

/** GET helper: the query key is the path itself, so invalidating a path refreshes every view of it. */
export const useGet = <T = any>(path: string | null, opts: { refetchInterval?: number | false } = {}) =>
  useQuery<T>({ queryKey: [path], queryFn: () => get<T>(path!), enabled: !!path, ...opts });

/** Mutation with toast feedback and cache invalidation by path prefix. */
export function useAct<A = void, R = any>(fn: (a: A) => Promise<R>, o: { success?: string; invalidate?: (string | QueryKey)[]; onDone?: (r: R) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      for (const k of o.invalidate ?? []) {
        if (typeof k === 'string') qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith(k) });
        else qc.invalidateQueries({ queryKey: k });
      }
      if (o.success) toast.success(o.success);
      o.onDone?.(r);
    },
    onError: (e) => toast.error(e),
  });
}
