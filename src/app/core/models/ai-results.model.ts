/**
 * Pre-computed AI results stored after parsing.
 * Generated once at parse-time, consumed by dashboard & insights.
 */

export interface AIDashboardSummary {
  summary: string;
  highlights: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface AIHealthTip {
  tip: string;
  impact: 'high' | 'medium' | 'low';
  category: 'savings' | 'spending' | 'investment' | 'debt';
}

export interface AIInsight {
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  amount?: number;
  percentChange?: number;
}

export interface AIAnomaly {
  type: 'spike' | 'duplicate' | 'unusual' | 'pattern';
  title: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
  amount?: number;
}

export interface AIResults {
  dashboardSummary: AIDashboardSummary | null;
  healthTips: AIHealthTip[];
  insights: AIInsight[];
  anomalies: AIAnomaly[];
  generatedAt: string;
  transactionCount: number;
}
