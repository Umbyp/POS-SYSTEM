import axios, { isAxiosError, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
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

// ---- Retry (idempotent GETs only) ----------------------------------------
// POST/PATCH/PUT/DELETE are never auto-retried: they may have reached the
// server before the connection dropped, and replaying them would duplicate
// the side effect (offline-queue callers use Idempotency-Key for that).

const MAX_GET_RETRIES = 2;
const RETRY_BASE_MS = 400;

type RetryableConfig = InternalAxiosRequestConfig & {
  __retryCount?: number;
  /** Opt out of the automatic GET retry for a single request. */
  noRetry?: boolean;
};

function shouldRetry(err: AxiosError, config: RetryableConfig | undefined): boolean {
  if (!config || config.noRetry) return false;
  if ((config.method ?? 'get').toLowerCase() !== 'get') return false;
  if ((config.__retryCount ?? 0) >= MAX_GET_RETRIES) return false;
  if (axios.isCancel(err)) return false;
  // Offline / DNS / connection refused (no response at all), but not a client-side timeout.
  if (!err.response) return err.code === 'ERR_NETWORK';
  return err.response.status >= 500;
}

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (isAxiosError(err)) {
      const config = err.config as RetryableConfig | undefined;
      if (shouldRetry(err, config)) {
        const attempt = (config!.__retryCount ?? 0) + 1;
        config!.__retryCount = attempt;
        const delay = RETRY_BASE_MS * 2 ** (attempt - 1) + Math.random() * 150; // 400ms, 800ms (+ jitter)
        await new Promise((resolve) => setTimeout(resolve, delay));
        return api.request(config!);
      }
    }
    if (err.response?.status === 401) {
      const shouldIgnore = err.config?.url?.includes('/auth/me') || err.config?.url?.includes('/auth/pin');
      if (!shouldIgnore) useAuthStore.getState().logout();
    }
    return Promise.reject(err);
  }
);

// ---- Typed error state -----------------------------------------------------

export type ApiErrorKind = 'offline' | 'timeout' | 'auth' | 'client' | 'server' | 'unknown';

export interface ApiErrorInfo {
  kind: ApiErrorKind;
  /** HTTP status, when the server answered. */
  status?: number;
  /** Thai, user-facing. Prefers the server's own `error`/`message` for 4xx. */
  message: string;
}

/** Normalises any thrown value into an offline/timeout/auth/client/server state. */
export function classifyError(err: unknown, fallback = 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'): ApiErrorInfo {
  if (!isAxiosError(err)) return { kind: 'unknown', message: fallback };
  if (!err.response) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return { kind: 'timeout', message: 'เซิร์ฟเวอร์ตอบสนองช้า ลองใหม่อีกครั้ง' };
    }
    return { kind: 'offline', message: 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต' };
  }
  const status = err.response.status;
  const serverMsg = (err.response.data as { error?: string; message?: string } | undefined)?.error
    ?? (err.response.data as { message?: string } | undefined)?.message;
  if (status === 401 || status === 403) return { kind: 'auth', status, message: serverMsg ?? 'ไม่มีสิทธิ์ใช้งานส่วนนี้' };
  if (status >= 500) return { kind: 'server', status, message: 'เซิร์ฟเวอร์ขัดข้อง ลองใหม่อีกครั้ง' };
  return { kind: 'client', status, message: serverMsg ?? fallback };
}

/** True when the request never got an answer (no network / timeout). */
export function isOfflineError(err: unknown): boolean {
  const k = classifyError(err).kind;
  return k === 'offline' || k === 'timeout';
}
