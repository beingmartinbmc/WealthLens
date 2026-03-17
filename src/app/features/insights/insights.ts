import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { StorageService } from '../../core/services/storage.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { ApiService } from '../../core/services/api.service';
import { Transaction } from '../../core/models/transaction.model';
import { Insight, Anomaly, SubscriptionDetection } from '../../core/models/insight.model';
import { buildLLMSummary } from '../../core/services/parsing/normalizer';
import { PROMPTS, buildPrompt } from '../../core/config/prompts';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './insights.html',
  styleUrl: './insights.scss',
})
export class InsightsComponent implements OnInit {
  insights = signal<Insight[]>([]);
  anomalies = signal<Anomaly[]>([]);
  subscriptions = signal<SubscriptionDetection[]>([]);
  loading = signal(true);
  activeTab = signal<'insights' | 'anomalies' | 'subscriptions'>('insights');

  constructor(
    private storage: StorageService,
    private analytics: AnalyticsService,
    private api: ApiService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const txns = await this.storage.getAllTransactions();

    if (txns.length === 0) {
      this.loading.set(false);
      return;
    }

    const summary = this.analytics.computeSummary(txns);
    const localInsights = this.analytics.generateInsights(txns, summary);
    this.insights.set(localInsights);

    const anomalies = this.analytics.detectAnomalies(txns);
    this.anomalies.set(anomalies);
    await this.storage.saveAnomalies(anomalies);

    const subs = this.analytics.detectSubscriptions(txns);
    this.subscriptions.set(subs);
    await this.storage.saveSubscriptions(subs);

    this.loading.set(false);

    // Enrich with AI insights in background
    this.fetchAIInsights(txns, localInsights);
  }

  setTab(tab: 'insights' | 'anomalies' | 'subscriptions'): void {
    this.activeTab.set(tab);
  }

  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high': return '#FF6B6B';
      case 'medium': return '#FFEAA7';
      case 'low': return '#00B894';
      default: return '#a0a0b8';
    }
  }

  getConfidenceLabel(confidence: number): string {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.5) return 'Medium';
    return 'Low';
  }

  formatCurrency(amount: number): string {
    return '₹' + amount.toLocaleString('en-IN');
  }

  getFrequencyLabel(freq: string): string {
    switch (freq) {
      case 'weekly': return 'Weekly';
      case 'monthly': return 'Monthly';
      case 'quarterly': return 'Quarterly';
      case 'yearly': return 'Yearly';
      default: return freq;
    }
  }

  getTotalSubscriptionCost(): number {
    return this.subscriptions()
      .filter(s => s.isActive)
      .reduce((sum, s) => {
        switch (s.frequency) {
          case 'weekly': return sum + s.amount * 4;
          case 'monthly': return sum + s.amount;
          case 'quarterly': return sum + s.amount / 3;
          case 'yearly': return sum + s.amount / 12;
          default: return sum + s.amount;
        }
      }, 0);
  }

  goToUpload(): void {
    this.router.navigate(['/upload']);
  }

  private async fetchAIInsights(txns: Transaction[], localInsights: Insight[]): Promise<void> {
    try {
      const context = buildLLMSummary(txns);
      const prompt = buildPrompt(PROMPTS.INSIGHTS, { CONTEXT: context });
      const result = await this.api.callGeneric(prompt, context);

      if (!result.success || !result.data) return;

      const parsed = this.api.parseJsonResponse<
        { title: string; message: string; priority: string; amount?: number; percentChange?: number }[]
      >(result.data);

      if (!parsed || !Array.isArray(parsed)) return;

      const aiInsights: Insight[] = parsed.map(item => ({
        id: uuidv4(),
        type: 'ai',
        title: '🤖 ' + item.title,
        message: item.message,
        priority: (item.priority as 'high' | 'medium' | 'low') || 'medium',
        amount: item.amount,
        percentChange: item.percentChange,
        createdAt: new Date().toISOString(),
      }));

      // Merge: AI insights after local ones
      this.insights.set([...localInsights, ...aiInsights]);
    } catch {
      // Silently fail — local insights are already displayed
    }
  }
}
