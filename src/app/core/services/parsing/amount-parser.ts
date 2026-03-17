/**
 * Deterministic amount parser for Indian bank/card statements.
 * Strips currency symbols, commas, whitespace and parses to a positive number.
 */

/** Parse an amount string → positive number (0 if unparseable) */
export function parseAmount(raw: string | undefined | null): number {
  if (!raw) return 0;
  // Strip ₹, Rs, INR, $, commas, spaces
  let s = raw.replace(/[₹$€£,\s]/g, '').replace(/Rs\.?/gi, '').replace(/INR/gi, '').trim();
  // Handle parenthesized negatives: (1234.56) → -1234.56
  const paren = s.match(/^\((.+)\)$/);
  if (paren) s = '-' + paren[1];
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Returns absolute value */
export function parseAbsAmount(raw: string | undefined | null): number {
  return Math.abs(parseAmount(raw));
}

/** Detect debit/credit from explicit markers (Dr/Cr, DR/CR, +/-, Debit/Credit) */
export function detectType(
  raw: string,
  debitAmount?: number,
  creditAmount?: number,
): 'debit' | 'credit' | null {
  // If separate debit/credit columns are provided
  if (debitAmount !== undefined && creditAmount !== undefined) {
    if (creditAmount > 0) return 'credit';
    if (debitAmount > 0) return 'debit';
    return null;
  }

  const upper = raw.toUpperCase().trim();

  // Explicit markers at end of description or amount
  if (/\bCR\b/.test(upper) || /CREDIT/.test(upper)) return 'credit';
  if (/\bDR\b/.test(upper) || /DEBIT/.test(upper)) return 'debit';

  // Sign-based
  const cleaned = raw.replace(/[₹$€£,\s]/g, '').replace(/Rs\.?/gi, '').trim();
  if (cleaned.startsWith('-') || cleaned.startsWith('(')) return 'debit';
  if (cleaned.startsWith('+')) return 'credit';

  return null;
}

/**
 * AMOUNT_REGEX matches Indian-formatted amounts: 1,23,456.78 or 123456.78 or 1234.56
 * The decimal part (.XX) is required to disambiguate from other numbers (dates, refs).
 */
export const AMOUNT_REGEX = /(?:[\d,]+\.\d{2})/g;

/** Find all amounts in a string */
export function findAmounts(text: string): number[] {
  const matches = text.match(AMOUNT_REGEX);
  if (!matches) return [];
  return matches.map(m => parseAbsAmount(m)).filter(n => n > 0);
}
