import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { StorageService } from '../../core/services/storage.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { Transaction } from '../../core/models/transaction.model';
import { FinancialSummary, FinancialHealthScore } from '../../core/models/insight.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
  transactions = signal<Transaction[]>([]);
  summary = signal<FinancialSummary | null>(null);
  healthScore = signal<FinancialHealthScore | null>(null);
  categoryBreakdown = signal<{ category: string; label: string; amount: number; color: string }[]>([]);
  dailySpend = signal<{ date: string; amount: number }[]>([]);
  loading = signal(true);
  selectedPeriod = signal<number>(0); // 0 = all, 3, 6, 12 months

  hasData = computed(() => this.transactions().length > 0);

  // Chart data computed
  maxMonthlyExpense = computed(() => {
    const s = this.summary();
    if (!s) return 1;
    return Math.max(...s.monthOverMonth.map(m => Math.max(m.income, m.expenses)), 1);
  });

  maxDailySpend = computed(() => {
    const ds = this.dailySpend();
    return ds.length > 0 ? Math.max(...ds.map(d => d.amount)) : 1;
  });

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
    this.transactions.set(txns);

    if (txns.length === 0) {
      this.loading.set(false);
      return;
    }

    const period = this.selectedPeriod() || undefined;
    const summary = this.analytics.computeSummary(txns, period);
    this.summary.set(summary);

    const health = this.analytics.computeHealthScore(txns, summary);
    this.healthScore.set(health);

    const breakdown = this.analytics.getCategoryBreakdown(txns);
    this.categoryBreakdown.set(breakdown);

    const daily = this.analytics.getDailySpend(txns);
    this.dailySpend.set(daily);

    this.loading.set(false);
  }

  async setPeriod(months: number): Promise<void> {
    this.selectedPeriod.set(months);
    await this.loadData();
  }

  goToUpload(): void {
    this.router.navigate(['/upload']);
  }

  formatCurrency(amount: number): string {
    return '₹' + amount.toLocaleString('en-IN');
  }

  getBarHeight(value: number, max: number): number {
    return max > 0 ? (value / max) * 100 : 0;
  }

  getHealthScoreColor(score: number): string {
    if (score >= 75) return '#00B894';
    if (score >= 50) return '#FFEAA7';
    if (score >= 25) return '#E17055';
    return '#FF6B6B';
  }

  getHealthScoreLabel(score: number): string {
    if (score >= 75) return 'Excellent';
    if (score >= 50) return 'Good';
    if (score >= 25) return 'Fair';
    return 'Needs Attention';
  }

  getCategoryPercentage(amount: number): number {
    const total = this.categoryBreakdown().reduce((s, c) => s + c.amount, 0);
    return total > 0 ? (amount / total) * 100 : 0;
  }

  getMonthLabel(monthStr: string): string {
    const [year, month] = monthStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[parseInt(month) - 1] + ' ' + year.slice(2);
  }
}
