/**
 * Converts internal Transaction objects to the normalized output schema
 * suitable for GPT-4.1 Nano consumption.
 */

import { Transaction, NormalizedTransaction } from '../../models/transaction.model';

/** Convert a single Transaction → NormalizedTransaction for LLM input */
export function toNormalized(t: Transaction): NormalizedTransaction {
  return {
    date: t.date,
    amount: t.amount,
    type: t.type,
    merchant: t.merchant,
    balance: t.balance ?? null,
    account_type: t.accountType,
    raw_description: t.rawDescription,
  };
}

/** Convert an array of Transactions → NormalizedTransaction[] */
export function toNormalizedBatch(transactions: Transaction[]): NormalizedTransaction[] {
  return transactions.map(toNormalized);
}

/**
 * Build a compact summary string for LLM context (no raw data, just aggregates).
 * This is safe to send externally in "hybrid" privacy mode.
 */
export function buildLLMSummary(transactions: Transaction[]): string {
  if (transactions.length === 0) return 'No transactions available.';

  const totalIncome = transactions
    .filter(t => t.type === 'credit')
    .reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions
    .filter(t => t.type === 'debit')
    .reduce((s, t) => s + t.amount, 0);

  const categoryTotals = new Map<string, number>();
  transactions
    .filter(t => t.type === 'debit')
    .forEach(t => {
      const cat = t.userCategoryOverride || t.category;
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + t.amount);
    });

  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, amt]) => `${cat}: ₹${Math.round(amt).toLocaleString('en-IN')}`)
    .join(', ');

  const months = new Set(transactions.map(t => t.date.substring(0, 7)));
  const dateRange = transactions.length > 0
    ? `${transactions.reduce((min, t) => t.date < min ? t.date : min, transactions[0].date)} to ${transactions.reduce((max, t) => t.date > max ? t.date : max, transactions[0].date)}`
    : 'N/A';

  return [
    `Period: ${dateRange} (${months.size} months)`,
    `Transactions: ${transactions.length}`,
    `Total Income: ₹${Math.round(totalIncome).toLocaleString('en-IN')}`,
    `Total Expenses: ₹${Math.round(totalExpenses).toLocaleString('en-IN')}`,
    `Net: ₹${Math.round(totalIncome - totalExpenses).toLocaleString('en-IN')}`,
    `Top Categories: ${topCategories}`,
  ].join('\n');
}
