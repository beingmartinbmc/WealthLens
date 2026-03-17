/**
 * Deterministic date parser for Indian bank statement formats.
 * Handles DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, DD Mon YYYY, DD-Mon-YY, YYYY-MM-DD, etc.
 */

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/** Returns YYYY-MM-DD or null */
export function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, ' ');

  // 1. DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return buildDate(+m[3], +m[2], +m[1]);

  // 2. DD/MM/YY or DD-MM-YY
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (m) return buildDate(expandYear(+m[3]), +m[2], +m[1]);

  // 3. YYYY-MM-DD (ISO)
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return buildDate(+m[1], +m[2], +m[3]);

  // 4. DD Mon YYYY  (e.g. 15 Jan 2024)
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const mon = MONTH_MAP[m[2].toLowerCase()];
    if (mon !== undefined) return buildDate(+m[3], mon + 1, +m[1]);
  }

  // 5. DD-Mon-YYYY or DD/Mon/YYYY  (e.g. 15-Jan-2024)
  m = s.match(/^(\d{1,2})[/\-]([A-Za-z]+)[/\-](\d{4})$/);
  if (m) {
    const mon = MONTH_MAP[m[2].toLowerCase()];
    if (mon !== undefined) return buildDate(+m[3], mon + 1, +m[1]);
  }

  // 6. DD-Mon-YY  (e.g. 15-Jan-24)
  m = s.match(/^(\d{1,2})[/\-]([A-Za-z]+)[/\-](\d{2})$/);
  if (m) {
    const mon = MONTH_MAP[m[2].toLowerCase()];
    if (mon !== undefined) return buildDate(expandYear(+m[3]), mon + 1, +m[1]);
  }

  // 7. DD Mon YY (e.g. 15 Jan 24)
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2})$/);
  if (m) {
    const mon = MONTH_MAP[m[2].toLowerCase()];
    if (mon !== undefined) return buildDate(expandYear(+m[3]), mon + 1, +m[1]);
  }

  // 8. Mon DD, YYYY (e.g. Jan 15, 2024 — Amex format)
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mon = MONTH_MAP[m[1].toLowerCase()];
    if (mon !== undefined) return buildDate(+m[3], mon + 1, +m[2]);
  }

  return null;
}

/** Regex that matches a date-like token at the start of a string */
export const DATE_START_REGEX =
  /^(\d{1,2}[/\-.](?:\d{1,2}|\w{3,9})[/\-.]\d{2,4}|\d{1,2}\s+\w{3,9}\s+\d{2,4}|\w{3,9}\s+\d{1,2},?\s+\d{4})/;

/** Checks if a string starts with a recognizable date */
export function startsWithDate(line: string): boolean {
  return DATE_START_REGEX.test(line.trim());
}

function expandYear(yy: number): number {
  return yy > 50 ? 1900 + yy : 2000 + yy;
}

function buildDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear().toString();
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
