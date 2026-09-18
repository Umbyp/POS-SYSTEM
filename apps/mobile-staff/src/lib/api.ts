import axios from 'axios';
import { API_URL } from '@/constants/config';
import { useAuthStore } from '@/stores/auth.store';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      const shouldIgnore = err.config?.url?.includes('/auth/me');
      if (!shouldIgnore) useAuthStore.getState().logout();
    }
    return Promise.reject(err);
  }
);
