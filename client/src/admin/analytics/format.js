const numberFormatter = new Intl.NumberFormat('en-IN');
const dateFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
const shortDateFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

export const formatNumber = (value) => numberFormatter.format(Number(value) || 0);

export const formatDateTime = (value) => (value ? dateTimeFormatter.format(new Date(value)) : '—');
export const formatDate = (value) => (value ? dateFormatter.format(new Date(value)) : '—');

export const formatChange = (value) => {
  if (value === null || value === undefined) return null;
  const rounded = Math.abs(value) < 0.1 ? 0 : value;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
};

/* Buckets arrive as 2026-11-04 (day), 2026-W45 (week), 2026-11 (month) or 2026 (year). */
export const formatBucket = (bucket) => {
  const value = String(bucket || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return shortDateFormatter.format(new Date(`${value}T12:00:00`));
  if (/^\d{4}-W\d{2}$/.test(value)) {
    const [year, week] = value.split('-W');
    return `Week ${Number(week)}, ${year}`;
  }
  if (/^\d{4}-\d{2}$/.test(value)) return new Date(`${value}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return value;
};

export const relativeTime = (value, now = Date.now()) => {
  const stamp = new Date(value).getTime();
  if (Number.isNaN(stamp)) return '—';
  const seconds = Math.round((now - stamp) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)} d ago`;
  return formatDate(value);
};

export const titleCase = (value) => String(value || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
