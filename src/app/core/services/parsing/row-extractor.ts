/**
 * Row extraction engine for Indian bank/card statement PDFs.
 *
 * Strategy:
 * 1. Scan lines for date-anchored rows (a line starting with a date = new transaction)
 * 2. Merge continuation lines (lines that don't start with a date) into the previous row
 * 3. Extract fields (date, description, amounts, balance) from each merged row
 * 4. Apply bank-specific heuristics for debit/credit detection
 */

import { TextLine } from './pdf-text-extractor';
import { parseDate, startsWithDate, DATE_START_REGEX } from './date-parser';
import { parseAbsAmount, findAmounts, AMOUNT_REGEX } from './amount-parser';

export interface RawRow {
  date: string;           // YYYY-MM-DD
  rawText: string;        // full merged text of the row
  description: string;    // text between date and first amount
  amounts: number[];      // all amounts found (could be debit, credit, balance)
  type: 'debit' | 'credit' | null;
  amount: number;
  balance: number | null;
  lineNumbers: number[];  // indices of source lines
}

/** Header/footer patterns to skip */
const SKIP_PATTERNS = [
  /^\s*page\s+\d/i,
  /^\s*statement\s+(of|period|from|date)/i,
  /^\s*date\s+(?:particulars|narration|description|details|transaction)/i,
  /^\s*(?:particulars|narration|description)\s+(?:date|amount|debit|credit)/i,
  /^\s*opening\s+balance/i,
  /^\s*closing\s+balance/i,
  /^\s*total\s*$/i,
  /^\s*(?:debit|credit)\s+(?:debit|credit)\s+balance/i,
  /^\s*sr\.?\s*no/i,
  /^\s*sl\.?\s*no/i,
  /^\s*generated\s+(?:on|by)/i,
  /^\s*this\s+is\s+(?:a\s+)?computer/i,
  /^\s*(?:registered|corporate)\s+office/i,
  /^\s*(?:customer|toll)\s*(?:care|free)/i,
  /^\s*\*{3,}/,
  /^\s*-{5,}/,
  /^\s*={5,}/,
];

function shouldSkipLine(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) return true;
  // Pure numbers (account numbers, page numbers)
  if (/^\d+$/.test(trimmed)) return true;
  return SKIP_PATTERNS.some(p => p.test(trimmed));
}

/**
 * Extract raw transaction rows from position-aware PDF lines.
 * Groups multi-line descriptions by detecting date-anchored starts.
 */
export function extractRows(lines: TextLine[]): RawRow[] {
  const rows: RawRow[] = [];
  let currentGroup: { lines: TextLine[]; startIdx: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();

    if (shouldSkipLine(text)) continue;

    if (startsWithDate(text)) {
      // Flush previous group
      if (currentGroup) {
        const row = parseGroup(currentGroup.lines, currentGroup.startIdx);
        if (row) rows.push(row);
      }
      currentGroup = { lines: [line], startIdx: i };
    } else if (currentGroup) {
      // Continuation line — merge into current group
      currentGroup.lines.push(line);
    }
    // else: orphan line before first date — skip
  }

  // Flush last group
  if (currentGroup) {
    const row = parseGroup(currentGroup.lines, currentGroup.startIdx);
    if (row) rows.push(row);
  }

  return rows;
}

/**
 * Same logic but for flat text (one string per line, no position info).
 */
export function extractRowsFromText(text: string): RawRow[] {
  const lines = text.split('\n').map((t, i) => ({
    text: t,
    items: [],
    y: i * 10,
    page: 1,
  }));
  return extractRows(lines);
}

function parseGroup(lines: TextLine[], startIdx: number): RawRow | null {
  const fullText = lines.map(l => l.text).join(' ').replace(/\s+/g, ' ').trim();

  // Extract date from start
  const dateMatch = fullText.match(DATE_START_REGEX);
  if (!dateMatch) return null;

  const dateStr = dateMatch[1];
  const date = parseDate(dateStr);
  if (!date) return null;

  // Everything after the date
  const afterDate = fullText.substring(dateMatch[0].length).trim();

  // Find all amounts in the remainder
  const amounts = findAmounts(afterDate);
  if (amounts.length === 0) return null;

  // Description = text between date and first amount occurrence
  const firstAmountMatch = afterDate.match(AMOUNT_REGEX);
  let description = afterDate;
  if (firstAmountMatch) {
    const idx = afterDate.indexOf(firstAmountMatch[0]);
    if (idx > 0) {
      description = afterDate.substring(0, idx).trim();
    }
  }

  // Clean up description: remove trailing Dr/Cr markers
  description = description.replace(/\s+(Dr|Cr|DR|CR)\s*$/i, '').trim();

  // Detect type from explicit markers in the full text
  let type: 'debit' | 'credit' | null = null;
  if (/\bCR\b/i.test(afterDate) && !/\bDR\b/i.test(afterDate)) {
    type = 'credit';
  } else if (/\bDR\b/i.test(afterDate) && !/\bCR\b/i.test(afterDate)) {
    type = 'debit';
  }

  // Determine amount and balance based on number of amounts found
  let amount = 0;
  let balance: number | null = null;

  if (amounts.length === 1) {
    amount = amounts[0];
  } else if (amounts.length === 2) {
    // Typically: [amount, balance] or [debit, credit]
    // Heuristic: the larger absolute value at the end is usually the balance
    if (amounts[1] > amounts[0] * 5) {
      amount = amounts[0];
      balance = amounts[1];
    } else {
      // Could be debit + credit columns — one is 0 or both present
      amount = amounts[0] || amounts[1];
    }
  } else if (amounts.length >= 3) {
    // Common layout: [debit_amount, credit_amount, balance]
    // Or: [amount, balance_before, balance_after]
    // Heuristic: last amount is usually balance (largest)
    balance = amounts[amounts.length - 1];

    // First non-zero among first two is the transaction amount
    for (let i = 0; i < amounts.length - 1; i++) {
      if (amounts[i] > 0) {
        amount = amounts[i];

        // If there are exactly 3+ amounts and positions 0,1 map to debit,credit columns
        if (amounts.length >= 3 && i === 1) {
          type = 'credit';
        } else if (amounts.length >= 3 && i === 0 && amounts[1] === 0) {
          type = 'debit';
        }
        break;
      }
    }
  }

  if (amount === 0) return null;
  if (description.length < 2) return null;

  return {
    date,
    rawText: fullText,
    description,
    amounts,
    type,
    amount,
    balance,
    lineNumbers: lines.map((_, idx) => startIdx + idx),
  };
}

/**
 * Apply bank-specific heuristics to refine type detection on raw rows.
 * Called after initial extraction.
 */
export function refineBankRows(
  rows: RawRow[],
  bankName: string,
  accountType: 'bank' | 'credit_card',
): RawRow[] {
  return rows.map(row => {
    let { type, amount, balance, amounts } = row;

    // --- HDFC Bank ---
    // Typical layout: Date | Narration | Chq/Ref | Value Date | Withdrawal | Deposit | Balance
    // amounts = [withdrawal?, deposit?, balance]
    if (bankName.includes('HDFC') && accountType === 'bank' && amounts.length >= 3) {
      const lastIsBalance = amounts[amounts.length - 1] > amounts[0] * 3;
      if (lastIsBalance) {
        balance = amounts[amounts.length - 1];
        // First two: withdrawal (debit) and deposit (credit)
        if (amounts[0] > 0 && (amounts.length < 3 || amounts[1] === 0 || amounts[1] === balance)) {
          amount = amounts[0];
          type = 'debit';
        } else if (amounts.length >= 2 && amounts[1] > 0 && amounts[1] !== balance) {
          amount = amounts[1];
          type = 'credit';
        }
      }
    }

    // --- ICICI Bank ---
    // Typical: Date | Mode | Particulars | Deposits | Withdrawals | Balance
    if (bankName.includes('ICICI') && accountType === 'bank' && amounts.length >= 3) {
      balance = amounts[amounts.length - 1];
      if (amounts[0] > 0 && amounts[0] !== balance) {
        amount = amounts[0];
        type = 'credit'; // Deposits column first in ICICI
      } else if (amounts.length >= 2 && amounts[1] > 0 && amounts[1] !== balance) {
        amount = amounts[1];
        type = 'debit';
      }
    }

    // --- SBI ---
    // Typical: Date | Description | Ref/Chq | Debit | Credit | Balance
    if (bankName.includes('SBI') && accountType === 'bank' && amounts.length >= 3) {
      balance = amounts[amounts.length - 1];
      if (amounts[0] > 0 && amounts[0] !== balance) {
        amount = amounts[0];
        type = 'debit';
      } else if (amounts.length >= 2 && amounts[1] > 0 && amounts[1] !== balance) {
        amount = amounts[1];
        type = 'credit';
      }
    }

    // --- Axis Bank ---
    if (bankName.includes('Axis') && accountType === 'bank' && amounts.length >= 3) {
      balance = amounts[amounts.length - 1];
      if (amounts[0] > 0 && amounts[0] !== balance) {
        amount = amounts[0];
        type = 'debit';
      } else if (amounts.length >= 2 && amounts[1] > 0 && amounts[1] !== balance) {
        amount = amounts[1];
        type = 'credit';
      }
    }

    // --- Kotak Bank ---
    if (bankName.includes('Kotak') && accountType === 'bank' && amounts.length >= 3) {
      balance = amounts[amounts.length - 1];
      if (amounts[0] > 0 && amounts[0] !== balance) {
        amount = amounts[0];
        type = 'debit';
      } else if (amounts.length >= 2 && amounts[1] > 0 && amounts[1] !== balance) {
        amount = amounts[1];
        type = 'credit';
      }
    }

    // --- Credit Cards (all issuers) ---
    // Credit card statements typically show one amount column.
    // CR suffix = payment/refund (credit), else = purchase (debit).
    if (accountType === 'credit_card') {
      if (!type) {
        // On credit card statements, most transactions are debits (purchases)
        type = 'debit';
      }
    }

    // --- American Express ---
    // Amex uses "Mon DD, YYYY" dates, single amount column, CR for credits
    if (bankName.includes('American Express')) {
      if (!type) {
        type = 'debit';
      }
      // Amex doesn't usually show running balance
      if (amounts.length === 1) {
        balance = null;
      }
    }

    // --- Fallback: balance-diff heuristic ---
    if (!type && balance !== null && rows.length > 1) {
      // If we can infer from balance changes, do so later in the pipeline
      type = 'debit'; // conservative default
    }

    if (!type) type = 'debit'; // final fallback

    return { ...row, type, amount, balance };
  });
}

/**
 * Post-process: use running balance to infer debit/credit where type is uncertain.
 * If balance[i] - balance[i-1] ≈ +amount → credit, ≈ -amount → debit.
 */
export function inferTypesFromBalance(rows: RawRow[]): RawRow[] {
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];

    if (prev.balance !== null && curr.balance !== null && curr.amount > 0) {
      const diff = curr.balance - prev.balance;
      const tolerance = curr.amount * 0.01; // 1% tolerance for rounding

      if (Math.abs(diff - curr.amount) < tolerance) {
        curr.type = 'credit';
      } else if (Math.abs(diff + curr.amount) < tolerance) {
        curr.type = 'debit';
      }
    }
  }
  return rows;
}
