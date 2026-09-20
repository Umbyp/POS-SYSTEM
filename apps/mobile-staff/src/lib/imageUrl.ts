import { API_URL } from '@/constants/config';

// Mirrors apps/web/src/lib/imageUrl.ts — Product.image can be an absolute
// Supabase URL or a relative /uploads/products/... path served by the API.
export function resolveImageUrl(value?: string | null): string {
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('data:')) return value;
  if (value.startsWith('/uploads/')) {
    return API_URL.replace(/\/api\/?$/, '') + value;
  }
  return value;
}
