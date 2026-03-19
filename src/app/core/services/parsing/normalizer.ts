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

  const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

  const credits = transactions.filter(t => t.type === 'credit');
  const debits = transactions.filter(t => t.type === 'debit');
  const totalIncome = credits.reduce((s, t) => s + t.amount, 0);
  const totalExpenses = debits.reduce((s, t) => s + t.amount, 0);
  const net = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((net / totalIncome) * 100).toFixed(1) : '0';

  // Category breakdown
  const categoryTotals = new Map<string, number>();
  debits.forEach(t => {
    const cat = t.userCategoryOverride || t.category;
    categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + t.amount);
  });
  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([cat, amt]) => `${cat}: ${fmt(amt)}`)
    .join(', ');

  // Month-over-month
  const monthlyData = new Map<string, { income: number; expenses: number }>();
  transactions.forEach(t => {
    const m = t.date.substring(0, 7);
    const d = monthlyData.get(m) || { income: 0, expenses: 0 };
    if (t.type === 'credit') d.income += t.amount; else d.expenses += t.amount;
    monthlyData.set(m, d);
  });
  const monthTrend = Array.from(monthlyData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, d]) => `${m}: income ${fmt(d.income)}, expenses ${fmt(d.expenses)}, savings ${fmt(d.income - d.expenses)}`)
    .join('\n  ');

  // Top merchants by spend
  const merchantTotals = new Map<string, number>();
  debits.forEach(t => merchantTotals.set(t.merchant, (merchantTotals.get(t.merchant) || 0) + t.amount));
  const topMerchants = Array.from(merchantTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([m, amt]) => `${m}: ${fmt(amt)}`)
    .join(', ');

  // Largest transactions
  const largestDebits = [...debits].sort((a, b) => b.amount - a.amount).slice(0, 5)
    .map(t => `${t.date} ${t.merchant} ${fmt(t.amount)}`).join('; ');
  const largestCredits = [...credits].sort((a, b) => b.amount - a.amount).slice(0, 3)
    .map(t => `${t.date} ${t.merchant} ${fmt(t.amount)}`).join('; ');

  const months = new Set(transactions.map(t => t.date.substring(0, 7)));
  const dateRange = `${transactions.reduce((min, t) => t.date < min ? t.date : min, transactions[0].date)} to ${transactions.reduce((max, t) => t.date > max ? t.date : max, transactions[0].date)}`;

  return [
    `Period: ${dateRange} (${months.size} months)`,
    `Transactions: ${transactions.length} (${credits.length} credits, ${debits.length} debits)`,
    `Total Income: ${fmt(totalIncome)}`,
    `Total Expenses: ${fmt(totalExpenses)}`,
    `Net Savings: ${fmt(net)} (${savingsRate}% savings rate)`,
    `Monthly Burn Rate: ${fmt(totalExpenses / Math.max(months.size, 1))}`,
    `Top Categories: ${topCategories}`,
    `Top Merchants: ${topMerchants}`,
    `Monthly Trend:\n  ${monthTrend}`,
    `Largest Expenses: ${largestDebits}`,
    `Largest Income: ${largestCredits}`,
  ].join('\n');
}
