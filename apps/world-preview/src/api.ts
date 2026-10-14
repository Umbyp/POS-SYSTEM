const KEY = 'world-preview-token';

export const getToken = () => sessionStorage.getItem(KEY);
export const clearToken = () => sessionStorage.removeItem(KEY);

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) throw new Error(body.error?.message ?? body.message ?? 'เข้าสู่ระบบไม่สำเร็จ');
  sessionStorage.setItem(KEY, body.token);
}

/** Read-only GET with the logged-in token. A 401 clears the token so the login form returns. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (res.status === 401) {
    clearToken();
    throw new Error('หมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}
