export const DEFAULT_TZ = 'Asia/Kolkata';

export function fmtDateTime(iso: string, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  }).format(new Date(iso));
}

export function fmtDate(iso: string, tz = DEFAULT_TZ, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz, ...opts }).format(new Date(iso));
}

export function fmtTime(iso: string, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso));
}

/** yyyy-mm-dd for a date-only string, displayed without timezone shifting. */
export function fmtPlainDate(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(diff) < 60) return 'just now';
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (Math.abs(diff) < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  return fmtDate(iso);
}

export const statusLabel: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Declined',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NEW: 'New',
  UNDER_REVIEW: 'Under review',
  RESPONDED: 'Responded',
  CLOSED: 'Closed',
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
};

/** Today's date (yyyy-mm-dd) in a timezone. */
export function todayIn(tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts; // en-CA gives yyyy-mm-dd
}
