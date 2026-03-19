import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';
import { Transaction } from '../models/transaction.model';
import {
  AIResults,
  AIDashboardSummary,
  AIHealthTip,
  AIInsight,
  AIAnomaly,
} from '../models/ai-results.model';
import { buildLLMSummary } from './parsing/normalizer';
import { PROMPTS, buildPrompt } from '../config/prompts';

const AI_RESULTS_KEY = 'ai-results';

@Injectable({ providedIn: 'root' })
export class AIResultsService {
  constructor(
    private api: ApiService,
    private storage: StorageService,
  ) {}

  /**
   * Run all LLM calls in parallel after parsing.
   * Stores results in IndexedDB settings store.
   */
  async generateAll(transactions: Transaction[]): Promise<AIResults> {
    const context = buildLLMSummary(transactions);

    // Fire all prompts in parallel
    const [summaryRes, healthRes, insightsRes, anomaliesRes] = await Promise.allSettled([
      this.fetchDashboardSummary(context),
      this.fetchHealthTips(context),
      this.fetchInsights(context),
      this.fetchAnomalies(context),
    ]);

    const results: AIResults = {
      dashboardSummary: summaryRes.status === 'fulfilled' ? summaryRes.value : null,
      healthTips: healthRes.status === 'fulfilled' ? healthRes.value : [],
      insights: insightsRes.status === 'fulfilled' ? insightsRes.value : [],
      anomalies: anomaliesRes.status === 'fulfilled' ? anomaliesRes.value : [],
      generatedAt: new Date().toISOString(),
      transactionCount: transactions.length,
    };

    // Persist to IndexedDB
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

  // --- Individual LLM calls ---

  private async fetchDashboardSummary(context: string): Promise<AIDashboardSummary | null> {
    const prompt = buildPrompt(PROMPTS.DASHBOARD_SUMMARY, { CONTEXT: context });
    const res = await this.api.callGeneric(prompt, context);
    if (!res.success || !res.data) return null;

    const parsed = this.api.parseJsonResponse<AIDashboardSummary>(res.data);
    if (!parsed || !parsed.summary) return null;
    return parsed;
  }

  private async fetchHealthTips(context: string): Promise<AIHealthTip[]> {
    const prompt = buildPrompt(PROMPTS.DASHBOARD_HEALTH, { CONTEXT: context });
    const res = await this.api.callGeneric(prompt, context);
    if (!res.success || !res.data) return [];

    const parsed = this.api.parseJsonResponse<AIHealthTip[]>(res.data);
    return Array.isArray(parsed) ? parsed : [];
  }

  private async fetchInsights(context: string): Promise<AIInsight[]> {
    const prompt = buildPrompt(PROMPTS.INSIGHTS, { CONTEXT: context });
    const res = await this.api.callGeneric(prompt, context);
    if (!res.success || !res.data) return [];

    const parsed = this.api.parseJsonResponse<AIInsight[]>(res.data);
    return Array.isArray(parsed) ? parsed : [];
  }

  private async fetchAnomalies(context: string): Promise<AIAnomaly[]> {
    const prompt = buildPrompt(PROMPTS.AI_ANOMALIES, { CONTEXT: context });
    const res = await this.api.callGeneric(prompt, context);
    if (!res.success || !res.data) return [];

    const parsed = this.api.parseJsonResponse<AIAnomaly[]>(res.data);
    return Array.isArray(parsed) ? parsed : [];
  }
}
