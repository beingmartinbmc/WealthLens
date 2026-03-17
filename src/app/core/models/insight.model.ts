export interface Insight {
  id: string;
  type: 'spending' | 'saving' | 'anomaly' | 'subscription' | 'trend' | 'tax' | 'ai';
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  category?: string;
  amount?: number;
  percentChange?: number;
  relatedTransactionIds?: string[];
  createdAt: string;
}

export interface Anomaly {
  id: string;
  type: 'anomaly' | 'duplicate' | 'subscription';
  message: string;
  confidence: number; // 0-1
  transactions: string[]; // transaction IDs
  amount?: number;
  detectedAt: string;
}

export interface SubscriptionDetection {
  merchant: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  lastCharge: string;
  transactionIds: string[];
  isActive: boolean;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number;
  monthlyBurnRate: number;
  topCategories: { category: string; amount: number; percentage: number }[];
  monthOverMonth: { month: string; income: number; expenses: number; savings: number }[];
}

export interface FinancialHealthScore {
  score: number; // 0-100
  breakdown: {
    savingsRate: number;
    expenseStability: number;
    debtRatio: number;
    diversification: number;
  };
  tips: string[];
}

export interface TaxInsight {
  estimatedTaxableIncome: number;
  salaryCredits: number;
  rentPayments: number;
  investmentTransactions: number;
  possibleDeductions: { section: string; description: string; amount: number }[];
}

export interface ProjectionScenario {
  name: string;
  adjustments: {
    incomeChange: number; // percentage
    categoryAdjustments: { category: string; changePercent: number }[];
    addSubscriptions: { name: string; amount: number }[];
    removeSubscriptions: string[];
  };
  projectedMonths: { month: string; balance: number; savings: number; expenses: number }[];
}
