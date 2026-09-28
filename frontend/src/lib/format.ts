const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

const monthYearFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
});

/** ISO timestamp → "Sep 28, 2026". */
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** ISO timestamp → "10:30 AM". */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** "2024-06" → "Jun 2024"; null → "Present". */
export function formatMonthYear(yearMonth: string | null): string {
  if (!yearMonth) return 'Present';
  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return yearMonth;
  return monthYearFormatter.format(new Date(year, month - 1, 1));
}

/** Bytes → "248 KB" / "1.2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const relativeFormatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** ISO timestamp → "just now" / "5 minutes ago" / "yesterday" / "3 weeks ago". */
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const seconds = (Date.parse(iso) - nowMs) / 1000;
  if (Number.isNaN(seconds)) return '';
  if (Math.abs(seconds) < 45) return 'just now';
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size || unit === 'minute') {
      return relativeFormatter.format(Math.round(seconds / size), unit);
    }
  }
  return 'just now';
}
