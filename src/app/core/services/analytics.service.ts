import { Injectable } from '@angular/core';
import { Transaction, TransactionCategory, CATEGORY_LABELS, CATEGORY_COLORS } from '../models/transaction.model';
import {
  FinancialSummary,
  Anomaly,
  SubscriptionDetection,
  FinancialHealthScore,
  TaxInsight,
  Insight,
  ProjectionScenario,
} from '../models/insight.model';
import { v4 as uuidv4 } from 'uuid';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  // --- Financial Summary ---
  computeSummary(transactions: Transaction[], months?: number): FinancialSummary {
    const now = new Date();
    const filtered = months
      ? transactions.filter(t => {
          const d = new Date(t.date);
          const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
          return diff <= months;
        })
      : transactions;

    const totalIncome = filtered.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
    const totalExpenses = filtered.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
    const netSavings = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

    // Monthly burn rate
    const monthSet = new Set(filtered.map(t => t.date.substring(0, 7)));
    const monthCount = Math.max(monthSet.size, 1);
    const monthlyBurnRate = totalExpenses / monthCount;

    // Top categories
    const categoryTotals = new Map<string, number>();
    filtered
      .filter(t => t.type === 'debit')
      .forEach(t => {
        const cat = t.userCategoryOverride || t.category;
        categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + t.amount);
      });

    const topCategories = Array.from(categoryTotals.entries())
      .map(([category, amount]) => ({
        category: CATEGORY_LABELS[category as TransactionCategory] || category,
        amount,
        percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Month-over-month
    const monthlyData = new Map<string, { income: number; expenses: number }>();
    filtered.forEach(t => {
      const month = t.date.substring(0, 7);
      const existing = monthlyData.get(month) || { income: 0, expenses: 0 };
      if (t.type === 'credit') existing.income += t.amount;
      else existing.expenses += t.amount;
      monthlyData.set(month, existing);
    });

    const monthOverMonth = Array.from(monthlyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        income: Math.round(data.income),
        expenses: Math.round(data.expenses),
        savings: Math.round(data.income - data.expenses),
      }));

    return {
      totalIncome: Math.round(totalIncome),
      totalExpenses: Math.round(totalExpenses),
      netSavings: Math.round(netSavings),
      savingsRate: Math.round(savingsRate * 10) / 10,
      monthlyBurnRate: Math.round(monthlyBurnRate),
      topCategories,
      monthOverMonth,
    };
  }

  // --- Anomaly Detection ---
  detectAnomalies(transactions: Transaction[]): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Duplicate detection
    anomalies.push(...this.detectDuplicates(transactions));

    // Statistical anomalies (z-score)
    anomalies.push(...this.detectStatisticalAnomalies(transactions));

    return anomalies;
  }

  private detectDuplicates(transactions: Transaction[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];

        // Within 2 days
        const daysDiff = Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 2) break;

        if (a.amount === b.amount && a.type === b.type) {
          const merchantSimilar =
            a.merchant.toLowerCase() === b.merchant.toLowerCase() ||
            a.description.toLowerCase().includes(b.merchant.toLowerCase()) ||
            b.description.toLowerCase().includes(a.merchant.toLowerCase());

          if (merchantSimilar) {
            anomalies.push({
              id: uuidv4(),
              type: 'duplicate',
              message: `Possible duplicate: ${a.merchant} - ₹${a.amount} on ${a.date} and ${b.date}`,
              confidence: daysDiff === 0 ? 0.9 : 0.7,
              transactions: [a.id, b.id],
              amount: a.amount,
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    return anomalies;
  }

  private detectStatisticalAnomalies(transactions: Transaction[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const debits = transactions.filter(t => t.type === 'debit');

    // Group by category
    const categoryGroups = new Map<string, Transaction[]>();
    debits.forEach(t => {
      const cat = t.userCategoryOverride || t.category;
      const existing = categoryGroups.get(cat) || [];
      existing.push(t);
      categoryGroups.set(cat, existing);
    });

    for (const [category, txns] of categoryGroups) {
      if (txns.length < 5) continue;

      const amounts = txns.map(t => t.amount);
      const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const stdDev = Math.sqrt(amounts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / amounts.length);

      if (stdDev === 0) continue;

      for (const t of txns) {
        const zScore = (t.amount - mean) / stdDev;
        if (zScore > 2.5) {
          anomalies.push({
            id: uuidv4(),
            type: 'anomaly',
            message: `Unusually high ${CATEGORY_LABELS[category as TransactionCategory] || category} spend: ₹${t.amount} at ${t.merchant} (${zScore.toFixed(1)}x std dev)`,
            confidence: Math.min(0.95, 0.5 + zScore * 0.1),
            transactions: [t.id],
            amount: t.amount,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }

    return anomalies;
  }

  // --- Subscription Detection ---
  detectSubscriptions(transactions: Transaction[]): SubscriptionDetection[] {
    const subscriptions: SubscriptionDetection[] = [];
    const debits = transactions.filter(t => t.type === 'debit');

    // Group by merchant + approximate amount
    const merchantGroups = new Map<string, Transaction[]>();
    debits.forEach(t => {
      const key = t.merchant.toLowerCase();
      const existing = merchantGroups.get(key) || [];
      existing.push(t);
      merchantGroups.set(key, existing);
    });

    for (const [merchant, txns] of merchantGroups) {
      if (txns.length < 2) continue;

      // Check for consistent amounts (within 10% tolerance)
      const amounts = txns.map(t => t.amount);
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const consistent = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.1);

      if (!consistent) continue;

      // Check for recurring pattern
      const dates = txns.map(t => new Date(t.date).getTime()).sort();
      const gaps: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }

      if (gaps.length === 0) continue;

      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;

      let frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null = null;
      if (avgGap >= 5 && avgGap <= 10) frequency = 'weekly';
      else if (avgGap >= 25 && avgGap <= 35) frequency = 'monthly';
      else if (avgGap >= 80 && avgGap <= 100) frequency = 'quarterly';
      else if (avgGap >= 350 && avgGap <= 380) frequency = 'yearly';

      if (frequency) {
        const sorted = txns.sort((a, b) => b.date.localeCompare(a.date));
        subscriptions.push({
          merchant: txns[0].merchant,
          amount: Math.round(avgAmount),
          frequency,
          lastCharge: sorted[0].date,
          transactionIds: txns.map(t => t.id),
          isActive: true,
        });
      }
    }

    return subscriptions;
  }

  // --- Generate Insights ---
  generateInsights(transactions: Transaction[], summary: FinancialSummary): Insight[] {
    const insights: Insight[] = [];

    // Savings rate insight
    if (summary.savingsRate < 10) {
      insights.push({
        id: uuidv4(),
        type: 'saving',
        priority: 'high',
        title: 'Low Savings Rate',
        message: `Your savings rate is only ${summary.savingsRate}%. Financial experts recommend saving at least 20% of income.`,
        createdAt: new Date().toISOString(),
      });
    } else if (summary.savingsRate > 30) {
      insights.push({
        id: uuidv4(),
        type: 'saving',
        priority: 'low',
        title: 'Great Savings Rate!',
        message: `You're saving ${summary.savingsRate}% of your income. Keep it up!`,
        createdAt: new Date().toISOString(),
      });
    }

    // Month-over-month spending changes
    if (summary.monthOverMonth.length >= 2) {
      const latest = summary.monthOverMonth[summary.monthOverMonth.length - 1];
      const previous = summary.monthOverMonth[summary.monthOverMonth.length - 2];

      if (previous.expenses > 0) {
        const change = ((latest.expenses - previous.expenses) / previous.expenses) * 100;
        if (change > 15) {
          insights.push({
            id: uuidv4(),
            type: 'spending',
            priority: 'high',
            title: 'Spending Increase',
            message: `Your spending increased by ${Math.round(change)}% compared to last month (₹${previous.expenses.toLocaleString()} → ₹${latest.expenses.toLocaleString()}).`,
            percentChange: change,
            createdAt: new Date().toISOString(),
          });
        } else if (change < -15) {
          insights.push({
            id: uuidv4(),
            type: 'spending',
            priority: 'low',
            title: 'Spending Decrease',
            message: `Great job! Your spending decreased by ${Math.round(Math.abs(change))}% compared to last month.`,
            percentChange: change,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    // Top spending category
    if (summary.topCategories.length > 0) {
      const top = summary.topCategories[0];
      insights.push({
        id: uuidv4(),
        type: 'spending',
        priority: 'medium',
        title: 'Top Spending Category',
        message: `${top.category} is your highest expense at ₹${top.amount.toLocaleString()} (${top.percentage.toFixed(1)}% of total).`,
        amount: top.amount,
        category: top.category,
        createdAt: new Date().toISOString(),
      });
    }

    // High burn rate warning
    if (summary.monthlyBurnRate > summary.totalIncome / Math.max(summary.monthOverMonth.length, 1) * 0.9) {
      insights.push({
        id: uuidv4(),
        type: 'spending',
        priority: 'high',
        title: 'High Burn Rate',
        message: `Your monthly burn rate (₹${summary.monthlyBurnRate.toLocaleString()}) is very close to your income. Consider reducing expenses.`,
        createdAt: new Date().toISOString(),
      });
    }

    return insights;
  }

  // --- Financial Health Score ---
  computeHealthScore(transactions: Transaction[], summary: FinancialSummary): FinancialHealthScore {
    // Savings rate score (0-30 points)
    const savingsScore = Math.min(30, Math.max(0, summary.savingsRate * 1.5));

    // Expense stability (0-25 points) - lower variance is better
    const monthlyExpenses = summary.monthOverMonth.map(m => m.expenses);
    let stabilityScore = 25;
    if (monthlyExpenses.length >= 2) {
      const mean = monthlyExpenses.reduce((s, e) => s + e, 0) / monthlyExpenses.length;
      const variance = monthlyExpenses.reduce((s, e) => s + Math.pow(e - mean, 2), 0) / monthlyExpenses.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
      stabilityScore = Math.max(0, 25 - cv * 50);
    }

    // Diversification score (0-25 points) - more categories with spending is better
    const activeCats = summary.topCategories.filter(c => c.percentage > 1).length;
    const diversificationScore = Math.min(25, activeCats * 4);

    // Debt ratio proxy (0-20 points)
    const debtCategories = ['rent', 'insurance', 'tax'];
    const debtExpenses = transactions
      .filter(t => t.type === 'debit' && debtCategories.includes(t.category))
      .reduce((s, t) => s + t.amount, 0);
    const debtRatio = summary.totalIncome > 0 ? debtExpenses / summary.totalIncome : 0;
    const debtScore = Math.max(0, 20 - debtRatio * 40);

    const totalScore = Math.round(savingsScore + stabilityScore + diversificationScore + debtScore);

    const tips: string[] = [];
    if (savingsScore < 15) tips.push('Aim to save at least 20% of your income each month.');
    if (stabilityScore < 12) tips.push('Your spending varies a lot month to month. Try setting a budget.');
    if (diversificationScore < 12) tips.push('Consider diversifying your expenses across categories.');
    if (debtScore < 10) tips.push('Your fixed obligations are high. Look for ways to reduce them.');

    return {
      score: Math.min(100, totalScore),
      breakdown: {
        savingsRate: Math.round(savingsScore),
        expenseStability: Math.round(stabilityScore),
        debtRatio: Math.round(debtScore),
        diversification: Math.round(diversificationScore),
      },
      tips,
    };
  }

  // --- Tax Insights ---
  computeTaxInsights(transactions: Transaction[]): TaxInsight {
    const salaryCredits = transactions
      .filter(t => t.type === 'credit' && t.category === 'salary')
      .reduce((s, t) => s + t.amount, 0);

    const rentPayments = transactions
      .filter(t => t.type === 'debit' && t.category === 'rent')
      .reduce((s, t) => s + t.amount, 0);

    const investmentTransactions = transactions
      .filter(t => t.type === 'debit' && t.category === 'investment')
      .reduce((s, t) => s + t.amount, 0);

    const possibleDeductions = [];

    // Section 80C - Investments
    if (investmentTransactions > 0) {
      possibleDeductions.push({
        section: '80C',
        description: 'Investments (ELSS, PPF, NPS, LIC)',
        amount: Math.min(investmentTransactions, 150000),
      });
    }

    // HRA
    if (rentPayments > 0) {
      possibleDeductions.push({
        section: '10(13A)',
        description: 'House Rent Allowance (HRA)',
        amount: rentPayments,
      });
    }

    // Standard deduction
    if (salaryCredits > 0) {
      possibleDeductions.push({
        section: '16(ia)',
        description: 'Standard Deduction',
        amount: 75000,
      });
    }

    // Health insurance
    const healthExpenses = transactions
      .filter(t => t.type === 'debit' && (t.category === 'health' || t.category === 'insurance'))
      .reduce((s, t) => s + t.amount, 0);

    if (healthExpenses > 0) {
      possibleDeductions.push({
        section: '80D',
        description: 'Health Insurance Premium',
        amount: Math.min(healthExpenses, 25000),
      });
    }

    return {
      estimatedTaxableIncome: salaryCredits,
      salaryCredits,
      rentPayments,
      investmentTransactions,
      possibleDeductions,
    };
  }

  // --- Projections ---
  generateProjection(
    transactions: Transaction[],
    summary: FinancialSummary,
    scenario: ProjectionScenario['adjustments'],
    monthsAhead: number = 12
  ): ProjectionScenario['projectedMonths'] {
    const avgIncome = summary.totalIncome / Math.max(summary.monthOverMonth.length, 1);
    const avgExpenses = summary.totalExpenses / Math.max(summary.monthOverMonth.length, 1);

    const adjustedIncome = avgIncome * (1 + (scenario.incomeChange || 0) / 100);

    // Calculate adjusted expenses
    let adjustedExpenses = avgExpenses;
    for (const adj of scenario.categoryAdjustments || []) {
      const catTotal = summary.topCategories.find(c => c.category === adj.category)?.amount || 0;
      const monthly = catTotal / Math.max(summary.monthOverMonth.length, 1);
      adjustedExpenses += monthly * (adj.changePercent / 100);
    }

    // Add/remove subscriptions
    for (const sub of scenario.addSubscriptions || []) {
      adjustedExpenses += sub.amount;
    }

    const projected: ProjectionScenario['projectedMonths'] = [];
    let runningBalance = summary.monthOverMonth.length > 0
      ? summary.monthOverMonth[summary.monthOverMonth.length - 1].savings
      : 0;

    const now = new Date();
    for (let i = 1; i <= monthsAhead; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthStr = month.toISOString().substring(0, 7);
      const savings = adjustedIncome - adjustedExpenses;
      runningBalance += savings;

      projected.push({
        month: monthStr,
        balance: Math.round(runningBalance),
        savings: Math.round(savings),
        expenses: Math.round(adjustedExpenses),
      });
    }

    return projected;
  }

  // --- Daily Spend Data ---
  getDailySpend(transactions: Transaction[]): { date: string; amount: number }[] {
    const dailyMap = new Map<string, number>();
    transactions
      .filter(t => t.type === 'debit')
      .forEach(t => {
        dailyMap.set(t.date, (dailyMap.get(t.date) || 0) + t.amount);
      });

    return Array.from(dailyMap.entries())
      .map(([date, amount]) => ({ date, amount: Math.round(amount) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // --- Category Breakdown ---
  getCategoryBreakdown(transactions: Transaction[]): { category: string; label: string; amount: number; color: string }[] {
    const categoryTotals = new Map<string, number>();
    transactions
      .filter(t => t.type === 'debit')
      .forEach(t => {
        const cat = t.userCategoryOverride || t.category;
        categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + t.amount);
      });

    return Array.from(categoryTotals.entries())
      .map(([category, amount]) => ({
        category,
        label: CATEGORY_LABELS[category as TransactionCategory] || category,
        amount: Math.round(amount),
        color: CATEGORY_COLORS[category as TransactionCategory] || '#B2BEC3',
      }))
      .sort((a, b) => b.amount - a.amount);
  }
}
