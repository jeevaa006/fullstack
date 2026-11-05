import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errorMessage } from '../../services/api';

const LIVE_REFRESH_MS = 30 * 1000;

const isCancelled = (error) => error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED';

export function useAnalytics(params) {
  const [state, setState] = useState({ data: null, loading: true, refreshing: false, error: '' });
  const serialized = JSON.stringify(params || {});
  const inFlight = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (inFlight.current) inFlight.current.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState((current) => ({ ...current, loading: !silent && !current.data, refreshing: silent, error: '' }));
    try {
      const { data } = await api.get('/admin/analytics', { params: JSON.parse(serialized), signal: controller.signal });
      if (controller.signal.aborted) return;
      setState({ data, loading: false, refreshing: false, error: '' });
    } catch (error) {
      if (controller.signal.aborted || isCancelled(error)) return;
      setState((current) => ({ ...current, loading: false, refreshing: false, error: errorMessage(error) }));
    }
  }, [serialized]);

  useEffect(() => {
    load();
    return () => { if (inFlight.current) inFlight.current.abort(); };
  }, [load]);

  const reload = useCallback(() => load({ silent: true }), [load]);
  return { ...state, reload };
}

export function useLiveAnalytics(enabled = true) {
  const [live, setLive] = useState(null);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/analytics/live');
      if (mounted.current) { setLive(data); setError(''); }
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return () => { mounted.current = false; };
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, LIVE_REFRESH_MS);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, load]);

  return { live, error, reload: load };
}
