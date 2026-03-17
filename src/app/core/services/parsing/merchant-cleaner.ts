/**
 * Deterministic merchant name cleaner.
 * Strips UPI refs, NEFT/IMPS IDs, transaction codes, and normalizes known merchants.
 */

const KNOWN_MERCHANTS: [RegExp, string][] = [
  [/\bamzn\b|amazon/i, 'Amazon'],
  [/\bflipkart\b|fkrt/i, 'Flipkart'],
  [/\bswiggy\b/i, 'Swiggy'],
  [/\bzomato\b/i, 'Zomato'],
  [/\buber\s?eats\b/i, 'Uber Eats'],
  [/\buber\b/i, 'Uber'],
  [/\bola\b/i, 'Ola'],
  [/\brapido\b/i, 'Rapido'],
  [/\bnetflix\b/i, 'Netflix'],
  [/\bspotify\b/i, 'Spotify'],
  [/\bhotstar\b|disney\+/i, 'Disney+ Hotstar'],
  [/\byoutube\b/i, 'YouTube'],
  [/\bgoogle\b/i, 'Google'],
  [/\bapple\b/i, 'Apple'],
  [/\bmyntra\b/i, 'Myntra'],
  [/\bajio\b/i, 'Ajio'],
  [/\bnykaa\b/i, 'Nykaa'],
  [/\bbigbasket\b/i, 'BigBasket'],
  [/\bblinkit\b/i, 'Blinkit'],
  [/\bzepto\b/i, 'Zepto'],
  [/\binstamart\b/i, 'Swiggy Instamart'],
  [/\bdunzo\b/i, 'Dunzo'],
  [/\bdomino/i, 'Dominos'],
  [/\bstarbucks\b/i, 'Starbucks'],
  [/\bmcdonalds?\b/i, 'McDonalds'],
  [/\bkfc\b/i, 'KFC'],
  [/\bpaytm\b/i, 'Paytm'],
  [/\bphonepe\b/i, 'PhonePe'],
  [/\bgpay\b|google\s*pay/i, 'Google Pay'],
  [/\bcred\b/i, 'CRED'],
  [/\bzerodha\b/i, 'Zerodha'],
  [/\bgroww\b/i, 'Groww'],
  [/\birctc\b/i, 'IRCTC'],
  [/\bmakemytrip\b|mmt\b/i, 'MakeMyTrip'],
  [/\bbookmyshow\b|bms\b/i, 'BookMyShow'],
  [/\bpharmeasy\b/i, 'PharmEasy'],
  [/\b1mg\b/i, '1mg'],
  [/\bchatgpt\b|openai/i, 'OpenAI'],
  [/\bmicrosoft\b/i, 'Microsoft'],
  [/\badobe\b/i, 'Adobe'],
  [/\blinkedin\b/i, 'LinkedIn'],
  [/\bpvr\b/i, 'PVR'],
  [/\binox\b/i, 'INOX'],
  [/\bdecathlon\b/i, 'Decathlon'],
  [/\bcroma\b/i, 'Croma'],
  [/\breliance\b/i, 'Reliance'],
  [/\bjio\b/i, 'Jio'],
  [/\bairtel\b/i, 'Airtel'],
  [/\bcult\.?fit\b/i, 'Cult.fit'],
];

const PAYMENT_PREFIXES = [
  /^UPI[-/]/i,
  /^UPI\s+/i,
  /^NEFT[-/]\s*/i,
  /^NEFT\s+/i,
  /^RTGS[-/]\s*/i,
  /^IMPS[-/]\s*/i,
  /^IMPS\s+/i,
  /^POS\s+/i,
  /^POS\s*\d+\s*/i,
  /^ATM[-/\s]+/i,
  /^BIL[-/]\s*/i,
  /^EMI[-/]\s*/i,
  /^SI[-/]\s*/i,
  /^ACH[-/\s]+/i,
  /^NFS[-/\s]+/i,
  /^CMS[-/\s]+/i,
  /^ECS[-/\s]+/i,
  /^NACH[-/\s]+/i,
  /^IB\s+/i,
  /^MB\s+/i,
  /^NET\s+BANKING\s*/i,
  /^MOBILE\s+BANKING\s*/i,
  /^DEBIT\s+CARD\s*/i,
  /^CREDIT\s+CARD\s*/i,
  /^VPS[-/\s]+/i,
];

/** Clean a raw transaction description into a human-readable merchant name */
export function cleanMerchant(rawDescription: string): string {
  let s = rawDescription.trim();
  if (!s) return 'Unknown';

  // 1. Strip payment method prefixes
  for (const prefix of PAYMENT_PREFIXES) {
    s = s.replace(prefix, '');
  }

  // 2. Remove long alphanumeric transaction IDs (≥10 chars)
  s = s.replace(/\b[A-Z0-9]{10,}\b/g, ' ');

  // 3. Remove UPI reference numbers (format: XXX@xxx or numeric refs)
  s = s.replace(/\b\S+@\S+\b/g, ' ');
  s = s.replace(/\bRef(?:\s*No)?\.?\s*[:.]?\s*\d+/gi, ' ');

  // 4. Remove trailing numeric references
  s = s.replace(/[-/]\s*\d{6,}.*$/g, '');

  // 5. Remove date-like fragments left over
  s = s.replace(/\b\d{2}[/-]\d{2}[/-]\d{2,4}\b/g, ' ');

  // 6. Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  // 7. Match against known merchants
  for (const [pattern, name] of KNOWN_MERCHANTS) {
    if (pattern.test(s)) return name;
  }

  // 8. Trim to first meaningful segment (before slashes/dashes with numbers)
  const cutoff = s.search(/\s*[-/]\s*\d/);
  if (cutoff > 5) s = s.substring(0, cutoff).trim();

  // 9. Title-case the result
  s = s
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  // 10. Final length cap
  return s.substring(0, 60) || 'Unknown';
}

/** Similarity score 0-1 between two merchant names (for dedup) */
export function merchantSimilarity(a: string, b: string): number {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1;

  // Check containment
  if (la.includes(lb) || lb.includes(la)) return 0.9;

  // Jaccard on trigrams
  const triA = trigrams(la);
  const triB = trigrams(lb);
  const intersection = triA.filter(t => triB.includes(t)).length;
  const union = new Set([...triA, ...triB]).size;
  return union > 0 ? intersection / union : 0;
}

function trigrams(s: string): string[] {
  const result: string[] = [];
  for (let i = 0; i <= s.length - 3; i++) {
    result.push(s.substring(i, i + 3));
  }
  return result;
}
