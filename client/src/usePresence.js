import { useEffect } from 'react';
import api from './services/api';

const HEARTBEAT_MS = 60 * 1000;

/*
 * Keeps a signed-in tab inside the server's presence window so the administrator's
 * live view reflects real open sessions. The server counts a user as online only
 * while lastActiveAt is recent, so an abandoned tab drops out on its own.
 */
export default function usePresence(user) {
  useEffect(() => {
    if (!user) return undefined;
    const ping = () => {
      if (document.visibilityState === 'hidden') return;
      api.post('/presence/heartbeat').catch(() => {
        // A failed heartbeat only affects the live view; the session itself is untouched.
      });
    };
    ping();
    const timer = window.setInterval(ping, HEARTBEAT_MS);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user]);
}
