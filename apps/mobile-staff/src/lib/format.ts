export function formatCurrency(value: number | string) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '฿0.00';
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(num);
}

export function formatDate(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatTime(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Minutes elapsed since `since`, as "N นาที" / "N ชม." / "N วัน" so stale data stays readable. */
export function formatElapsedMinutes(since: Date | string) {
  const t = typeof since === 'string' ? new Date(since).getTime() : since.getTime();
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 120) return `${mins} นาที`;
  if (mins < 2880) return `${Math.floor(mins / 60)} ชม.`;
  return `${Math.floor(mins / 1440)} วัน`;
}
