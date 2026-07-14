import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  timeout: 15000,
});

/** Analytics service (pos-analytics) — separate instance because URL/auth differ */
export const analyticsApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_ANALYTICS_API || 'http://localhost:8000',
  timeout: 30000,
});

// Read token from either the legacy 'token' key OR the zustand-persisted 'pos-auth' bag
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const direct = localStorage.getItem('token');
  if (direct) return direct;
  try {
    const raw = localStorage.getItem('pos-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.token || null;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      // Don't redirect for auth/me failures during hydration, and ignore broadcast failures
      const shouldIgnoreRedirect = 
        err.config?.url?.includes('/auth/me') || 
        err.config?.url?.includes('/display/broadcast');

      if (!shouldIgnoreRedirect) {
        localStorage.removeItem('token');
        try {
          // Clear the persisted zustand state too
          const raw = localStorage.getItem('pos-auth');
          if (raw) {
            const parsed = JSON.parse(raw);
            localStorage.setItem(
              'pos-auth',
              JSON.stringify({ ...parsed, state: { ...parsed.state, user: null, token: null } })
            );
          }
        } catch {
          /* ignore */
        }
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);
