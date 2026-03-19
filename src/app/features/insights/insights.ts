import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { StorageService } from '../../core/services/storage.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { AIResultsService } from '../../core/services/ai-results.service';
import { Transaction } from '../../core/models/transaction.model';
import { Insight, Anomaly, SubscriptionDetection } from '../../core/models/insight.model';
import { AIAnomaly } from '../../core/models/ai-results.model';
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

  aiAnomalies = signal<AIAnomaly[]>([]);
  activeAnomalyTab = signal<'local' | 'ai'>('ai');

  constructor(
    private storage: StorageService,
    private analytics: AnalyticsService,
    private aiResults: AIResultsService,
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

    // Load pre-computed AI results from storage
    this.loadAIResults(localInsights);
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

  setAnomalyTab(tab: 'local' | 'ai'): void {
    this.activeAnomalyTab.set(tab);
  }

  getSeverityColor(severity: string): string {
    switch (severity) {
      case 'high': return '#FF6B6B';
      case 'medium': return '#FFEAA7';
      case 'low': return '#00B894';
      default: return '#a0a0b8';
    }
  }

  private async loadAIResults(localInsights: Insight[]): Promise<void> {
    try {
      const cached = await this.aiResults.getCached();
      if (!cached) return;

      // Merge AI insights
      if (cached.insights.length > 0) {
        const aiInsights: Insight[] = cached.insights.map(item => ({
          id: uuidv4(),
          type: 'ai' as const,
          title: '\u{1F916} ' + item.title,
          message: item.message,
          priority: item.priority || 'medium',
          amount: item.amount,
          percentChange: item.percentChange,
          createdAt: cached.generatedAt,
        }));
        this.insights.set([...aiInsights, ...localInsights]);
      }

      // Load AI anomalies
      if (cached.anomalies.length > 0) {
        this.aiAnomalies.set(cached.anomalies);
      }
    } catch {
      // AI results unavailable — local insights already shown
    }
  }
}
