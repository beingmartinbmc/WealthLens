import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { StorageService } from '../../core/services/storage.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { Transaction } from '../../core/models/transaction.model';
import { Insight, Anomaly, SubscriptionDetection } from '../../core/models/insight.model';

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
    const insights = this.analytics.generateInsights(txns, summary);
    this.insights.set(insights);

    const anomalies = this.analytics.detectAnomalies(txns);
    this.anomalies.set(anomalies);
    await this.storage.saveAnomalies(anomalies);

    const subs = this.analytics.detectSubscriptions(txns);
    this.subscriptions.set(subs);
    await this.storage.saveSubscriptions(subs);

    this.loading.set(false);
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
}
