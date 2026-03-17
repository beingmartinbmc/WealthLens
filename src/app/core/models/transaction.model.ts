export interface Transaction {
  id: string;
  date: string; // ISO YYYY-MM-DD
  amount: number;
  type: 'debit' | 'credit';
  description: string;
  rawDescription: string;
  merchant: string;
  category: TransactionCategory;
  account: string;
  accountType: 'bank' | 'credit_card';
  sourceFile: string;
  balance?: number | null;
  currency?: string;
  userCategoryOverride?: TransactionCategory;
  tags?: string[];
}

/** Lightweight output schema for GPT-4.1 Nano consumption */
export interface NormalizedTransaction {
  date: string;
  amount: number;
  type: 'debit' | 'credit';
  merchant: string;
  balance: number | null;
  account_type: 'bank' | 'credit_card';
  raw_description: string;
}

export type TransactionCategory =
  | 'food'
  | 'rent'
  | 'transport'
  | 'shopping'
  | 'subscriptions'
  | 'salary'
  | 'utilities'
  | 'entertainment'
  | 'health'
  | 'education'
  | 'investment'
  | 'transfer'
  | 'tax'
  | 'insurance'
  | 'misc';

export interface ParsedStatement {
  fileName: string;
  fileType: 'pdf' | 'csv';
  account: string;
  accountType: 'bank' | 'credit_card';
  transactions: Transaction[];
  parseDate: string;
  errors: string[];
  duplicatesRemoved: number;
}

export interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  debit?: string;
  credit?: string;
  balance?: string;
  type?: string;
}

export const CATEGORY_COLORS: Record<TransactionCategory, string> = {
  food: '#FF6B6B',
  rent: '#4ECDC4',
  transport: '#45B7D1',
  shopping: '#96CEB4',
  subscriptions: '#FFEAA7',
  salary: '#6C5CE7',
  utilities: '#FD79A8',
  entertainment: '#00B894',
  health: '#E17055',
  education: '#0984E3',
  investment: '#6C5CE7',
  transfer: '#636E72',
  tax: '#D63031',
  insurance: '#00CEC9',
  misc: '#B2BEC3',
};

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  food: 'Food & Dining',
  rent: 'Rent & Housing',
  transport: 'Transport',
  shopping: 'Shopping',
  subscriptions: 'Subscriptions',
  salary: 'Salary & Income',
  utilities: 'Utilities',
  entertainment: 'Entertainment',
  health: 'Health & Medical',
  education: 'Education',
  investment: 'Investments',
  transfer: 'Transfers',
  tax: 'Tax',
  insurance: 'Insurance',
  misc: 'Miscellaneous',
};
