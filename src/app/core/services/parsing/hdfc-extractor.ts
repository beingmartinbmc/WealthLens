/**
 * HDFC Bank-specific position-aware PDF extractor.
 *
 * HDFC statement column layout:
 *   Date | Narration | Chq./Ref.No. | Value Dt | Withdrawal Amt. | Deposit Amt. | Closing Balance
 *
 * Strategy:
 * 1. Detect column boundaries from the header row (contains "Withdrawal" and "Deposit")
 * 2. Skip page headers (everything before the column header on each page)
 * 3. Use X-positions of individual text items to classify amounts into
 *    Withdrawal (debit), Deposit (credit), or Balance columns
 * 4. Merge multi-line narrations
 */

import { TextLine, TextItem } from './pdf-text-extractor';
import { parseDate, startsWithDate, DATE_START_REGEX } from './date-parser';
import { parseAbsAmount, AMOUNT_REGEX } from './amount-parser';
import type { RawRow } from './row-extractor';

interface ColumnBounds {
  withdrawalX: number;   // left edge of Withdrawal column
  depositX: number;      // left edge of Deposit column
  balanceX: number;      // left edge of Closing Balance column
}


/**
 * Detect column boundaries from HDFC statement header row.
 * Scans for the row containing "Withdrawal" and "Deposit" text items.
 */
export function detectHdfcColumns(lines: TextLine[]): ColumnBounds | null {
  for (const line of lines) {
    const text = line.text.toLowerCase();
    if (text.includes('withdrawal') && text.includes('deposit') && text.includes('closing')) {
      // Found the column header row — extract X positions from items
      let withdrawalX = 0;
      let depositX = 0;
      let balanceX = 0;

      for (const item of line.items) {
        const s = item.str.toLowerCase().trim();
        if (s.includes('withdrawal')) withdrawalX = item.x;
        if (s.includes('deposit')) depositX = item.x;
        if (s.includes('closing')) balanceX = item.x;
      }

      if (withdrawalX > 0 && depositX > 0 && balanceX > 0) {
        return { withdrawalX, depositX, balanceX };
      }
    }
  }
  return null;
}

/**
 * Check if a line is the HDFC column header row.
 */
function isColumnHeaderRow(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('date') &&
    lower.includes('narration') &&
    (lower.includes('withdrawal') || lower.includes('deposit'))
  );
}

/**
 * Classify an amount item into withdrawal/deposit/balance based on its X position.
 * Uses column header X positions as boundaries:
 *   x < depositX  → withdrawal
 *   x < balanceX  → deposit
 *   x >= balanceX → balance
 */
function classifyAmountByX(
  x: number,
  cols: ColumnBounds,
): 'withdrawal' | 'deposit' | 'balance' {
  if (x >= cols.balanceX) return 'balance';
  if (x >= cols.depositX) return 'deposit';
  return 'withdrawal';
}

/**
 * Extract HDFC transactions using position-aware column detection.
 * This is the main entry point for HDFC-specific extraction.
 */
export function extractHdfcRows(lines: TextLine[]): RawRow[] {
  const cols = detectHdfcColumns(lines);
  if (!cols) {
    return [];
  }

  // Filter: keep only lines after column header rows (skip page headers)
  const transactionLines = filterTransactionLines(lines);

  // Group lines into multi-line transactions (date-anchored)
  const groups = groupTransactionLines(transactionLines);

  // Parse each group using column-aware amount classification
  const rows: RawRow[] = [];
  for (const group of groups) {
    const row = parseHdfcGroup(group, cols);
    if (row) rows.push(row);
  }

  return rows;
}

/**
 * Filter lines: include everything after each column header row.
 * The column header row appears on every page of the HDFC statement.
 * This is the only reliable signal — no complex pattern matching needed.
 */
function filterTransactionLines(lines: TextLine[]): TextLine[] {
  const result: TextLine[] = [];
  let seenHeader = false;

  for (const line of lines) {
    const text = line.text.trim();

    // Column header row resets the gate (appears on each page)
    if (isColumnHeaderRow(text)) {
      seenHeader = true;
      continue;
    }

    if (!seenHeader) continue;
    if (text.length < 2) continue;

    result.push(line);
  }

  return result;
}

/**
 * Group consecutive lines into multi-line transactions.
 * A new transaction starts when a line begins with a date.
 */
function groupTransactionLines(lines: TextLine[]): TextLine[][] {
  const groups: TextLine[][] = [];
  let currentGroup: TextLine[] | null = null;

  for (const line of lines) {
    const text = line.text.trim();
    if (text.length < 2) continue;

    if (startsWithDate(text)) {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = [line];
    } else if (currentGroup) {
      currentGroup.push(line);
    }
    // orphan lines before first transaction are skipped
  }

  if (currentGroup) groups.push(currentGroup);
  return groups;
}

/**
 * Parse a group of HDFC transaction lines using column-aware amount detection.
 */
function parseHdfcGroup(lines: TextLine[], cols: ColumnBounds): RawRow | null {
  // Full merged text for date/description extraction
  const fullText = lines.map(l => l.text).join(' ').replace(/\s+/g, ' ').trim();

  // Extract date
  const dateMatch = fullText.match(DATE_START_REGEX);
  if (!dateMatch) return null;

  const date = parseDate(dateMatch[1]);
  if (!date) return null;

  // Collect all text items from all lines in this group
  const allItems = lines.flatMap(l => l.items);

  // Find amount items by regex matching on individual items
  let withdrawalAmt = 0;
  let depositAmt = 0;
  let balanceAmt: number | null = null;

  for (const item of allItems) {
    const s = item.str.trim();
    if (!AMOUNT_REGEX.test(s)) {
      AMOUNT_REGEX.lastIndex = 0;
      continue;
    }
    AMOUNT_REGEX.lastIndex = 0;

    const val = parseAbsAmount(s);
    if (val <= 0) continue;

    const col = classifyAmountByX(item.x, cols);
    if (col === 'withdrawal') {
      withdrawalAmt = val;
    } else if (col === 'deposit') {
      depositAmt = val;
    } else if (col === 'balance') {
      balanceAmt = val;
    }
  }

  // Determine transaction amount and type
  let amount = 0;
  let type: 'debit' | 'credit' | null = null;

  if (withdrawalAmt > 0) {
    amount = withdrawalAmt;
    type = 'debit';
  } else if (depositAmt > 0) {
    amount = depositAmt;
    type = 'credit';
  }

  if (amount === 0) return null;

  // Extract description: text between date and first amount occurrence
  const afterDate = fullText.substring(dateMatch[0].length).trim();
  const firstAmtMatch = afterDate.match(AMOUNT_REGEX);
  AMOUNT_REGEX.lastIndex = 0;
  let description = afterDate;
  if (firstAmtMatch) {
    const idx = afterDate.indexOf(firstAmtMatch[0]);
    if (idx > 0) {
      description = afterDate.substring(0, idx).trim();
    }
  }

  // Remove value date from description (DD/MM/YY pattern in the middle)
  description = description.replace(/\s+\d{2}\/\d{2}\/\d{2,4}\s*$/, '').trim();
  // Remove ref numbers (long digit strings)
  description = description.replace(/\s+\d{10,}\s*/g, ' ').trim();
  // Remove trailing Dr/Cr
  description = description.replace(/\s+(Dr|Cr|DR|CR)\s*$/i, '').trim();

  if (description.length < 2) return null;

  // Collect all amounts for the row record
  const amounts: number[] = [];
  if (withdrawalAmt > 0) amounts.push(withdrawalAmt);
  if (depositAmt > 0) amounts.push(depositAmt);
  if (balanceAmt !== null) amounts.push(balanceAmt);

  return {
    date,
    rawText: fullText,
    description,
    amounts,
    type,
    amount,
    balance: balanceAmt,
    lineNumbers: lines.map((_, i) => i),
  };
}
