/**
 * Detects bank/card issuer and account type from PDF text content.
 */

export interface BankDetection {
  bank: string;
  accountType: 'bank' | 'credit_card';
  confidence: number;
}

interface BankSignature {
  keywords: string[];
  bank: string;
  accountType: 'bank' | 'credit_card';
  /** Higher priority = checked first (useful when keywords overlap, e.g. "HDFC") */
  priority: number;
}

const SIGNATURES: BankSignature[] = [
  // Credit cards first (more specific keywords)
  { keywords: ['american express', 'amex', 'membership rewards'], bank: 'American Express', accountType: 'credit_card', priority: 10 },
  { keywords: ['hdfc bank credit card', 'hdfc credit card', 'hdfc card statement'], bank: 'HDFC Credit Card', accountType: 'credit_card', priority: 9 },
  { keywords: ['icici credit card', 'icici card statement'], bank: 'ICICI Credit Card', accountType: 'credit_card', priority: 9 },
  { keywords: ['sbi credit card', 'sbi card statement', 'sbicard'], bank: 'SBI Credit Card', accountType: 'credit_card', priority: 9 },
  { keywords: ['axis credit card', 'axis card statement', 'axis bank credit'], bank: 'Axis Credit Card', accountType: 'credit_card', priority: 9 },
  { keywords: ['kotak credit card'], bank: 'Kotak Credit Card', accountType: 'credit_card', priority: 9 },
  { keywords: ['yes bank credit card'], bank: 'Yes Bank Credit Card', accountType: 'credit_card', priority: 9 },

  // Banks (savings/current accounts)
  { keywords: ['hdfc bank', 'hdfcbank'], bank: 'HDFC Bank', accountType: 'bank', priority: 5 },
  { keywords: ['icici bank'], bank: 'ICICI Bank', accountType: 'bank', priority: 5 },
  { keywords: ['state bank of india', 'sbi '], bank: 'SBI', accountType: 'bank', priority: 5 },
  { keywords: ['axis bank'], bank: 'Axis Bank', accountType: 'bank', priority: 5 },
  { keywords: ['kotak mahindra', 'kotak bank'], bank: 'Kotak Mahindra Bank', accountType: 'bank', priority: 5 },
  { keywords: ['yes bank'], bank: 'Yes Bank', accountType: 'bank', priority: 5 },
  { keywords: ['indusind'], bank: 'IndusInd Bank', accountType: 'bank', priority: 4 },
  { keywords: ['federal bank'], bank: 'Federal Bank', accountType: 'bank', priority: 4 },
  { keywords: ['idbi bank'], bank: 'IDBI Bank', accountType: 'bank', priority: 4 },
  { keywords: ['bank of baroda', 'bob '], bank: 'Bank of Baroda', accountType: 'bank', priority: 4 },
  { keywords: ['punjab national', 'pnb '], bank: 'PNB', accountType: 'bank', priority: 4 },
  { keywords: ['canara bank'], bank: 'Canara Bank', accountType: 'bank', priority: 4 },
  { keywords: ['union bank'], bank: 'Union Bank', accountType: 'bank', priority: 4 },
  { keywords: ['citibank', 'citi bank'], bank: 'Citibank', accountType: 'bank', priority: 4 },
  { keywords: ['hsbc'], bank: 'HSBC', accountType: 'bank', priority: 4 },
  { keywords: ['standard chartered'], bank: 'Standard Chartered', accountType: 'bank', priority: 4 },
];

/**
 * Additional heuristics: if the text contains "credit card" or "card statement"
 * but we matched a bank, override to credit_card.
 */
const CARD_INDICATORS = [
  'credit card', 'card statement', 'card account', 'card number',
  'card no', 'minimum amount due', 'total amount due', 'payment due date',
  'reward points', 'membership rewards',
];

const BANK_INDICATORS = [
  'savings account', 'current account', 'account statement',
  'opening balance', 'closing balance', 'cheque no',
];

export function detectBank(text: string): BankDetection {
  const lower = text.toLowerCase();

  // Use only the first ~1000 chars (header/metadata) for primary detection
  // to avoid transaction narrations (e.g. "Amex bill payment") triggering wrong bank.
  const header = lower.substring(0, 1000);

  // Sort by priority descending
  const sorted = [...SIGNATURES].sort((a, b) => b.priority - a.priority);

  // Phase 1: Match against header text only
  for (const sig of sorted) {
    for (const kw of sig.keywords) {
      if (header.includes(kw)) {
        const accountType = resolveAccountType(sig.accountType, lower);
        return { bank: sig.bank, accountType, confidence: 0.95 };
      }
    }
  }

  // Phase 2: Fall back to full text (for short PDFs or unusual layouts)
  for (const sig of sorted) {
    for (const kw of sig.keywords) {
      if (lower.includes(kw)) {
        const accountType = resolveAccountType(sig.accountType, lower);
        return { bank: sig.bank, accountType, confidence: 0.7 };
      }
    }
  }

  // Fallback: try to at least detect bank vs card
  const isCard = CARD_INDICATORS.some(ci => lower.includes(ci));
  return {
    bank: 'Unknown',
    accountType: isCard ? 'credit_card' : 'bank',
    confidence: isCard ? 0.5 : 0.3,
  };
}

function resolveAccountType(
  detected: 'bank' | 'credit_card',
  fullText: string,
): 'bank' | 'credit_card' {
  const hasCardIndicators = CARD_INDICATORS.some(ci => fullText.includes(ci));
  const hasBankIndicators = BANK_INDICATORS.some(bi => fullText.includes(bi));

  if (detected === 'bank' && hasCardIndicators && !hasBankIndicators) {
    return 'credit_card';
  }
  if (detected === 'credit_card' && hasBankIndicators && !hasCardIndicators) {
    return 'bank';
  }
  return detected;
}
