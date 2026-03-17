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

  // Score each signature by counting keyword occurrences in the full text.
  // A bank statement will mention its own bank name many more times
  // (IFSC codes, header, footer, narrations) than a merchant name that
  // happens to appear in a single transaction (e.g. "Amex bill payment").
  const scores: { sig: BankSignature; score: number }[] = [];

  for (const sig of SIGNATURES) {
    let score = 0;
    for (const kw of sig.keywords) {
      // Count all occurrences of this keyword
      let idx = 0;
      while ((idx = lower.indexOf(kw, idx)) !== -1) {
        score++;
        idx += kw.length;
      }
    }
    if (score > 0) {
      scores.push({ sig, score });
    }
  }

  if (scores.length === 0) {
    const isCard = CARD_INDICATORS.some(ci => lower.includes(ci));
    return {
      bank: 'Unknown',
      accountType: isCard ? 'credit_card' : 'bank',
      confidence: isCard ? 0.5 : 0.3,
    };
  }

  // Sort by score descending, then priority descending for ties
  scores.sort((a, b) => b.score - a.score || b.sig.priority - a.sig.priority);

  const best = scores[0];
  const accountType = resolveAccountType(best.sig.accountType, lower);
  const confidence = best.score >= 3 ? 0.95 : best.score >= 2 ? 0.8 : 0.6;

  return { bank: best.sig.bank, accountType, confidence };
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
