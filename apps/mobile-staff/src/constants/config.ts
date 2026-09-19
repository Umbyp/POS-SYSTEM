// EXPO_PUBLIC_* vars are inlined at build time (same convention as the web
// app's NEXT_PUBLIC_* vars) — set them in eas.json per build profile.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export function getSocketUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (explicit) return explicit;
  return API_URL.replace(/\/api\/?$/, '');
}

// Base URL of the customer-facing web app (apps/web) — a different origin
// from the API in production, so it can't be derived from API_URL the way
// the socket URL can.
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000';
