/**
 * Prompt templates for LLM interactions.
 * All prompts sent to the backend are defined and versioned here.
 * Use template literal placeholders like {{VARIABLE}} that get replaced at runtime.
 */

export const PROMPTS = {

  /** System-level instruction for the financial copilot */
  SYSTEM: `You are WealthLens, a privacy-first financial copilot. You analyze Indian bank and credit card transactions. You respond in concise, actionable language. All amounts are in INR (₹). Never fabricate data — only use what is provided in the context.`,

  /** Generate insights from a financial summary */
  INSIGHTS: `Based on the following financial data, generate 3-5 actionable insights. Focus on spending patterns, saving opportunities, and anomalies. Be specific with numbers.

{{CONTEXT}}

Respond as a JSON array of objects with fields: title, message, priority (high/medium/low), amount (optional number), percentChange (optional number).`,

  /** Categorize transactions that couldn't be auto-categorized */
  CATEGORIZE: `Categorize the following transactions into one of these categories: food, rent, transport, shopping, subscriptions, salary, utilities, entertainment, health, education, investment, transfer, tax, insurance, misc.

Transactions:
{{TRANSACTIONS}}

Respond as a JSON array of objects: { index: number, category: string, confidence: number }.`,

  /** Chat query — user asks a financial question */
  CHAT: `You are a financial assistant. Answer the user's question using only the provided financial context. Be concise and use ₹ for amounts.

Financial Context:
{{CONTEXT}}

User Question: {{QUESTION}}`,

  /** Detect anomalies from transaction data */
  ANOMALIES: `Analyze these transactions for anomalies: duplicates, unusual amounts, suspicious patterns, and potential fraud. Only flag genuine concerns.

{{CONTEXT}}

Respond as a JSON array of objects: { type: "duplicate"|"anomaly"|"suspicious", message: string, amount: number, confidence: number }.`,

  /** Dashboard financial summary — natural language overview */
  DASHBOARD_SUMMARY: `You are a concise financial analyst. Based on the data below, write a 3-4 sentence personalized financial summary. Mention the savings rate, biggest spending category, any notable month-over-month trends, and one actionable suggestion. Use ₹ for amounts. Be direct — no filler.

{{CONTEXT}}

Respond as JSON: { "summary": "...", "highlights": ["highlight1", "highlight2", "highlight3"], "sentiment": "positive" | "neutral" | "negative" }`,

  /** Dashboard health analysis — AI-powered tips */
  DASHBOARD_HEALTH: `Based on this financial data, provide 3-4 specific, actionable health tips. Reference actual numbers from the data. Focus on: savings improvement, spending optimization, subscription audit, and investment opportunities relevant to Indian users.

{{CONTEXT}}

Respond as JSON array: [{ "tip": "...", "impact": "high" | "medium" | "low", "category": "savings" | "spending" | "investment" | "debt" }]`,

  /** AI-powered anomaly detection */
  AI_ANOMALIES: `Analyze these transactions for anomalies. Look for: unusually large transactions, duplicate charges, sudden spending spikes, potential unauthorized transactions, and unusual patterns. Only flag genuine concerns with specific amounts and dates.

{{CONTEXT}}

Respond as JSON array: [{ "type": "spike" | "duplicate" | "unusual" | "pattern", "title": "...", "message": "...", "severity": "high" | "medium" | "low", "amount": number }]`,

  /** Tax insights for Indian context */
  TAX_INSIGHTS: `Based on the following Indian financial data, identify potential tax deductions under sections 80C, 80D, 80G, HRA (10(13A)), and others. Only mention sections that apply.

{{CONTEXT}}

Respond as a JSON array of objects: { section: string, amount: number, description: string }.`,

} as const;

export type PromptKey = keyof typeof PROMPTS;

/**
 * Interpolate a prompt template with variables.
 * Replaces {{KEY}} placeholders with provided values.
 */
export function buildPrompt(
  template: string,
  variables: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}
