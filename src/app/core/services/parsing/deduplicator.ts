/**
 * Transaction deduplication engine.
 * Uses date + amount + description similarity to detect and remove duplicates.
 */

import { Transaction } from '../../models/transaction.model';
import { merchantSimilarity } from './merchant-cleaner';

export interface DeduplicationResult {
  unique: Transaction[];
  duplicatesRemoved: number;
  duplicatePairs: [string, string][]; // pairs of IDs
}

/**
 * Remove duplicate transactions.
 * Two transactions are duplicates if:
 *   - Same date (or within 1 day)
 *   - Same amount (exact match)
 *   - Same type (debit/credit)
 *   - Similar merchant/description (similarity > 0.6)
 */
export function deduplicateTransactions(transactions: Transaction[]): DeduplicationResult {
  const sorted = [...transactions].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.amount - b.amount;
  });

  const removed = new Set<number>();
  const duplicatePairs: [string, string][] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (removed.has(i)) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      if (removed.has(j)) continue;

      const a = sorted[i];
      const b = sorted[j];

      // Quick exit: if dates are more than 1 day apart, stop inner loop
      const daysDiff = Math.abs(
        new Date(a.date).getTime() - new Date(b.date).getTime()
      ) / (1000 * 60 * 60 * 24);

      if (daysDiff > 1) break; // sorted by date, so no more matches possible

      // Same amount and type?
      if (a.amount !== b.amount || a.type !== b.type) continue;

      // Check merchant/description similarity
      const sim = Math.max(
        merchantSimilarity(a.merchant, b.merchant),
        merchantSimilarity(a.rawDescription, b.rawDescription),
      );

      if (sim >= 0.6) {
        // Same source file? More likely a real duplicate.
        // Different source file? Still flag if similarity is high.
        const threshold = a.sourceFile === b.sourceFile ? 0.6 : 0.8;
        if (sim >= threshold) {
          removed.add(j);
          duplicatePairs.push([a.id, b.id]);
        }
      }
    }
  }

  const unique = sorted.filter((_, idx) => !removed.has(idx));

  return {
    unique,
    duplicatesRemoved: removed.size,
    duplicatePairs,
  };
}
