import { Injectable } from '@angular/core';
import { TransactionCategory } from '../models/transaction.model';
import { StorageService } from './storage.service';

interface CategoryRule {
  keywords: string[];
  category: TransactionCategory;
}

const CATEGORY_RULES: CategoryRule[] = [
  // Food & Dining
  {
    keywords: [
      'swiggy', 'zomato', 'uber eats', 'dominos', 'pizza', 'restaurant', 'cafe',
      'coffee', 'starbucks', 'mcdonalds', 'kfc', 'burger', 'food', 'dining',
      'bakery', 'biryani', 'kitchen', 'dhaba', 'meals', 'lunch', 'dinner',
      'breakfast', 'snacks', 'barbeque', 'freshmen', 'dunzo', 'blinkit',
      'zepto', 'bigbasket', 'grofers', 'instamart',
    ],
    category: 'food',
  },
  // Rent & Housing
  {
    keywords: ['rent', 'housing', 'society', 'maintenance', 'landlord', 'pg ', 'hostel'],
    category: 'rent',
  },
  // Transport
  {
    keywords: [
      'uber', 'ola', 'rapido', 'metro', 'irctc', 'railway', 'petrol', 'diesel',
      'fuel', 'parking', 'toll', 'fastag', 'cab', 'taxi', 'auto', 'bus',
      'flight', 'airline', 'indigo', 'spicejet', 'vistara', 'makemytrip',
      'goibibo', 'cleartrip', 'redbus',
    ],
    category: 'transport',
  },
  // Shopping
  {
    keywords: [
      'amazon', 'amzn', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho',
      'shoppers stop', 'lifestyle', 'westside', 'hm ', 'zara', 'uniqlo',
      'decathlon', 'croma', 'reliance digital', 'vijay sales',
    ],
    category: 'shopping',
  },
  // Subscriptions
  {
    keywords: [
      'netflix', 'hotstar', 'prime video', 'spotify', 'apple', 'google storage',
      'youtube premium', 'jio', 'airtel', 'vi ', 'bsnl', 'notion', 'chatgpt',
      'openai', 'github', 'adobe', 'microsoft', 'linkedin premium', 'medium',
      'subscription', 'renewal', 'recurring',
    ],
    category: 'subscriptions',
  },
  // Salary & Income
  {
    keywords: [
      'salary', 'payroll', 'stipend', 'freelance', 'payment received',
      'credit interest', 'dividend', 'cashback', 'refund', 'reimbursement',
    ],
    category: 'salary',
  },
  // Utilities
  {
    keywords: [
      'electricity', 'water bill', 'gas bill', 'internet', 'broadband',
      'wifi', 'act fibernet', 'tata play', 'dth', 'mobile recharge',
      'postpaid', 'prepaid',
    ],
    category: 'utilities',
  },
  // Entertainment
  {
    keywords: [
      'pvr', 'inox', 'cinema', 'movie', 'bookmyshow', 'event', 'concert',
      'game', 'steam', 'playstation', 'xbox', 'nintendo',
    ],
    category: 'entertainment',
  },
  // Health
  {
    keywords: [
      'hospital', 'clinic', 'doctor', 'pharmacy', 'medical', 'apollo',
      'medplus', 'pharmeasy', 'netmeds', '1mg', 'lab', 'diagnostic',
      'dental', 'eye', 'gym', 'fitness', 'cult.fit', 'yoga',
    ],
    category: 'health',
  },
  // Education
  {
    keywords: [
      'school', 'college', 'university', 'tuition', 'course', 'udemy',
      'coursera', 'unacademy', 'byjus', 'vedantu', 'book', 'exam',
    ],
    category: 'education',
  },
  // Investment
  {
    keywords: [
      'mutual fund', 'sip', 'zerodha', 'groww', 'kuvera', 'coin',
      'nps', 'ppf', 'fd ', 'fixed deposit', 'stocks', 'shares',
      'lic', 'investment', 'mf ', 'nifty', 'sensex',
    ],
    category: 'investment',
  },
  // Transfer
  {
    keywords: [
      'neft', 'rtgs', 'imps', 'upi', 'transfer to', 'transfer from',
      'self transfer', 'fund transfer',
    ],
    category: 'transfer',
  },
  // Tax
  {
    keywords: ['income tax', 'gst', 'tds', 'tax payment', 'advance tax'],
    category: 'tax',
  },
  // Insurance
  {
    keywords: [
      'insurance', 'premium', 'policy', 'hdfc ergo', 'icici lombard',
      'star health', 'acko', 'digit',
    ],
    category: 'insurance',
  },
];

@Injectable({ providedIn: 'root' })
export class CategorizationService {
  private userOverrides = new Map<string, string>();

  constructor(private storage: StorageService) {
    this.loadOverrides();
  }

  private async loadOverrides(): Promise<void> {
    this.userOverrides = await this.storage.getCategoryOverrides();
  }

  categorize(description: string, merchant: string): TransactionCategory {
    const normalizedMerchant = merchant.toLowerCase().trim();
    const normalizedDesc = description.toLowerCase().trim();

    // Check user overrides first
    const override = this.userOverrides.get(normalizedMerchant);
    if (override) {
      return override as TransactionCategory;
    }

    // Rule-based matching
    const searchText = `${normalizedDesc} ${normalizedMerchant}`;

    for (const rule of CATEGORY_RULES) {
      for (const keyword of rule.keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          return rule.category;
        }
      }
    }

    return 'misc';
  }

  async setOverride(merchant: string, category: TransactionCategory): Promise<void> {
    const normalized = merchant.toLowerCase().trim();
    this.userOverrides.set(normalized, category);
    await this.storage.setCategoryOverride(normalized, category);
  }

  normalizeMerchant(description: string): string {
    let merchant = description.trim();

    // Remove common prefixes
    const prefixes = [
      'UPI-', 'UPI/', 'NEFT-', 'NEFT/', 'IMPS-', 'IMPS/',
      'POS ', 'ATM ', 'BIL/', 'EMI/', 'SI-', 'ACH/',
    ];
    for (const prefix of prefixes) {
      if (merchant.toUpperCase().startsWith(prefix)) {
        merchant = merchant.substring(prefix.length);
      }
    }

    // Remove transaction IDs (long alphanumeric strings)
    merchant = merchant.replace(/[A-Z0-9]{10,}/g, '').trim();

    // Remove trailing reference numbers
    merchant = merchant.replace(/\s*[-/]\s*\d{6,}.*$/, '').trim();

    // Common merchant normalizations
    const merchantMap: Record<string, string> = {
      'amzn': 'Amazon',
      'amazon': 'Amazon',
      'swiggy': 'Swiggy',
      'zomato': 'Zomato',
      'uber': 'Uber',
      'ola': 'Ola',
      'flipkart': 'Flipkart',
      'netflix': 'Netflix',
      'spotify': 'Spotify',
      'google': 'Google',
      'apple': 'Apple',
    };

    const lowerMerchant = merchant.toLowerCase();
    for (const [key, value] of Object.entries(merchantMap)) {
      if (lowerMerchant.includes(key)) {
        return value;
      }
    }

    // Capitalize first letter of each word
    return merchant
      .split(' ')
      .filter(w => w.length > 0)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .substring(0, 50);
  }
}
