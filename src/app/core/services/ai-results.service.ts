import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';
import { Transaction } from '../models/transaction.model';
import { AIResults } from '../models/ai-results.model';
import { buildLLMSummary } from './parsing/normalizer';
import { PROMPTS, buildPrompt } from '../config/prompts';

const AI_RESULTS_KEY = 'ai-results';

/** Shape returned by the ANALYZE_ALL prompt */
interface AnalyzeAllResponse {
  summary?: { text?: string; highlights?: string[]; sentiment?: string };
  insights?: { title: string; message: string; priority?: string; amount?: number; percentChange?: number }[];
  healthTips?: { tip: string; impact?: string; category?: string }[];
  anomalies?: { type?: string; title: string; message: string; severity?: string; amount?: number }[];
}

@Injectable({ providedIn: 'root' })
export class AIResultsService {
  constructor(
    private api: ApiService,
    private storage: StorageService,
  ) {}

  /**
   * Single LLM call that generates all AI data at once.
   * Stores results in IndexedDB settings store.
   */
  async generateAll(transactions: Transaction[]): Promise<AIResults> {
    const context = buildLLMSummary(transactions);
    const prompt = buildPrompt(PROMPTS.ANALYZE_ALL, { CONTEXT: context });

    const res = await this.api.callGeneric(prompt, context);
    const parsed = res.success && res.data
      ? this.api.parseJsonResponse<AnalyzeAllResponse>(res.data)
      : null;

    const results: AIResults = {
      dashboardSummary: parsed?.summary?.text
        ? {
            summary: parsed.summary.text,
            highlights: parsed.summary.highlights ?? [],
            sentiment: (parsed.summary.sentiment as 'positive' | 'neutral' | 'negative') ?? 'neutral',
          }
        : null,
      insights: Array.isArray(parsed?.insights)
        ? parsed.insights.map(i => ({
            title: i.title,
            message: i.message,
            priority: (i.priority as 'high' | 'medium' | 'low') ?? 'medium',
            amount: i.amount,
            percentChange: i.percentChange,
          }))
        : [],
      healthTips: Array.isArray(parsed?.healthTips)
        ? parsed.healthTips.map(t => ({
            tip: t.tip,
            impact: (t.impact as 'high' | 'medium' | 'low') ?? 'medium',
            category: (t.category as 'savings' | 'spending' | 'investment' | 'debt') ?? 'spending',
          }))
        : [],
      anomalies: Array.isArray(parsed?.anomalies)
        ? parsed.anomalies.map(a => ({
            type: (a.type as 'spike' | 'duplicate' | 'unusual' | 'pattern') ?? 'unusual',
            title: a.title,
            message: a.message,
            severity: (a.severity as 'high' | 'medium' | 'low') ?? 'medium',
            amount: a.amount,
          }))
        : [],
      generatedAt: new Date().toISOString(),
      transactionCount: transactions.length,
    };

    await this.storage.setSetting(AI_RESULTS_KEY, results);
    return results;
  }

  /**
   * Read cached AI results from storage.
   */
  async getCached(): Promise<AIResults | null> {
    return (await this.storage.getSetting<AIResults>(AI_RESULTS_KEY)) ?? null;
  }

  /**
   * Clear cached AI results.
   */
  async clearCache(): Promise<void> {
    await this.storage.setSetting(AI_RESULTS_KEY, null);
  }
}
