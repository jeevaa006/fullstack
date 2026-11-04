import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import AuthContext from './authContext';
import api from '../services/api';
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const restoreSession = () => api.get('/auth/me').then(({ data }) => setUser(data.user)).catch(() => setUser(null)).finally(() => setLoading(false));
    restoreSession();
    const revalidateAfterBackNavigation = (event) => { if (!event.persisted) return; setLoading(true); restoreSession(); };
    window.addEventListener('pageshow', revalidateAfterBackNavigation);
    return () => window.removeEventListener('pageshow', revalidateAfterBackNavigation);
  }, []);
  const login = useCallback(async (credentials) => { const { data } = await api.post('/auth/login', credentials); setUser(data.user); return data.user; }, []);
  const register = useCallback(async (role, details) => { const { data } = await api.post(`/auth/register/${role}`, details); setUser(data.user); return data.user; }, []);
  const logout = useCallback(async () => { try { await api.post('/auth/logout'); } finally { setUser(null); } }, []);
  const value = useMemo(() => ({ user, setUser, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
AuthProvider.propTypes = { children: PropTypes.node.isRequired };
