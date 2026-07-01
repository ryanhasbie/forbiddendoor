const TZ_OPTIONS = [
  { id: 'Asia/Jakarta', short: 'WIB', label: 'WIB (UTC+7)', offsetHours: 7 },
  { id: 'Asia/Makassar', short: 'WITA', label: 'WITA (UTC+8)', offsetHours: 8 },
  { id: 'Asia/Jayapura', short: 'WIT', label: 'WIT (UTC+9)', offsetHours: 9 },
];

const TZ_BY_ID = Object.fromEntries(TZ_OPTIONS.map((tz) => [tz.id, tz]));
const TZ_IDS = TZ_OPTIONS.map((tz) => tz.id);

function isValidTimezone(timeZone) {
  return TZ_IDS.includes(timeZone);
}

function getTimezoneMeta(timeZone) {
  return TZ_BY_ID[timeZone] || TZ_BY_ID['Asia/Jakarta'];
}

function wallClockToUtc(isoLocal, timeZone) {
  const meta = getTimezoneMeta(timeZone);
  const normalized = String(isoLocal).trim().replace(' ', 'T');
  const withSec = normalized.split(':').length === 2 ? `${normalized}:00` : normalized;
  const match = withSec.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return new Date(NaN);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);

  return new Date(
    Date.UTC(year, month - 1, day, hour - meta.offsetHours, minute, second)
  );
}

function parseStoredTimestamp(value) {
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    return new Date(str.replace(' ', 'T') + 'Z');
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(str)) {
    return new Date(str);
  }
  const normalized = str.replace(' ', 'T');
  const withSec = normalized.split(':').length === 2 ? `${normalized}:00` : normalized;
  return new Date(withSec.endsWith('Z') ? withSec : `${withSec}Z`);
}

function formatUtcDate(date, timeZone, showTz = true) {
  if (Number.isNaN(date.getTime())) return '';

  const formatted = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  if (!showTz) return formatted;
  return `${formatted} ${getTimezoneMeta(timeZone).short}`;
}

function formatKickoff(kickoff, displayTimezone, appTimezone) {
  const utc = wallClockToUtc(kickoff, appTimezone);
  if (Number.isNaN(utc.getTime())) return String(kickoff);
  return formatUtcDate(utc, displayTimezone);
}

function formatTimestamp(timestamp, displayTimezone) {
  const date = parseStoredTimestamp(timestamp);
  if (Number.isNaN(date.getTime())) return String(timestamp);
  return formatUtcDate(date, displayTimezone);
}

module.exports = {
  TZ_OPTIONS,
  TZ_IDS,
  isValidTimezone,
  getTimezoneMeta,
  wallClockToUtc,
  parseStoredTimestamp,
  formatKickoff,
  formatTimestamp,
};