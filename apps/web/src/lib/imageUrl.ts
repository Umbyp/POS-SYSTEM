/**
 * Resolve a Product.image value to a full URL the browser can load.
 *
 * Inputs handled:
 *   - "/uploads/products/abc.webp"  → prepended with the API origin (no /api suffix)
 *   - "http(s)://..."               → returned as-is
 *   - "data:image/..."              → returned as-is
 *   - "" / null / undefined         → returns ""
 */
export function resolveImageUrl(value?: string | null): string {
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('data:')) return value;
  if (value.startsWith('/uploads/')) {
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    // Strip the trailing "/api" (or "/api/") so uploads serve from the root
    const origin = apiBase.replace(/\/api\/?$/, '');
    return origin + value;
  }
  return value;
}
