import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { StorageService } from '../../core/services/storage.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { Transaction } from '../../core/models/transaction.model';
import { FinancialSummary, ProjectionScenario } from '../../core/models/insight.model';

@Component({
  selector: 'app-simulator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './simulator.html',
  styleUrl: './simulator.scss',
})
export class SimulatorComponent implements OnInit {
  transactions = signal<Transaction[]>([]);
  summary = signal<FinancialSummary | null>(null);
  loading = signal(true);

  incomeChange = signal(0);
  monthsAhead = signal(12);
  categoryAdjustments = signal<{ category: string; label: string; currentAmount: number; changePercent: number }[]>([]);

  projectedMonths = signal<ProjectionScenario['projectedMonths']>([]);

  maxProjectedBalance = computed(() => {
    const months = this.projectedMonths();
    if (months.length === 0) return 1;
    return Math.max(...months.map(m => Math.abs(m.balance)), 1);
  });

  constructor(
    private storage: StorageService,
    private analytics: AnalyticsService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    const txns = await this.storage.getAllTransactions();
    this.transactions.set(txns);

    if (txns.length > 0) {
      const summary = this.analytics.computeSummary(txns);
      this.summary.set(summary);

      const adjustments = summary.topCategories.slice(0, 6).map(cat => ({
        category: cat.category,
        label: cat.category,
        currentAmount: Math.round(cat.amount / Math.max(summary.monthOverMonth.length, 1)),
        changePercent: 0,
      }));
      this.categoryAdjustments.set(adjustments);

      this.runProjection();
    }

    this.loading.set(false);
  }

  runProjection(): void {
    const s = this.summary();
    if (!s) return;

    const scenario: ProjectionScenario['adjustments'] = {
      incomeChange: this.incomeChange(),
      categoryAdjustments: this.categoryAdjustments()
        .filter(a => a.changePercent !== 0)
        .map(a => ({ category: a.category, changePercent: a.changePercent })),
      addSubscriptions: [],
      removeSubscriptions: [],
    };

    const projected = this.analytics.generateProjection(
      this.transactions(),
      s,
      scenario,
      this.monthsAhead()
    );

    this.projectedMonths.set(projected);
  }

  onIncomeChange(value: number): void {
    this.incomeChange.set(value);
    this.runProjection();
  }

  onCategoryChange(index: number, value: number): void {
    this.categoryAdjustments.update(cats => {
      const updated = [...cats];
      updated[index] = { ...updated[index], changePercent: value };
      return updated;
    });
    this.runProjection();
  }

  onMonthsChange(value: number): void {
    this.monthsAhead.set(value);
    this.runProjection();
  }

  resetAll(): void {
    this.incomeChange.set(0);
    this.categoryAdjustments.update(cats =>
      cats.map(c => ({ ...c, changePercent: 0 }))
    );
    this.runProjection();
  }

  formatCurrency(amount: number): string {
    return '₹' + Math.abs(amount).toLocaleString('en-IN');
  }

  getBarHeight(value: number): number {
    const max = this.maxProjectedBalance();
    return max > 0 ? (Math.abs(value) / max) * 100 : 0;
  }

  getMonthLabel(monthStr: string): string {
    const [year, month] = monthStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[parseInt(month) - 1] + ' ' + year.slice(2);
  }

  goToUpload(): void {
    this.router.navigate(['/upload']);
  }

  getProjectedSavingsTotal(): number {
    return this.projectedMonths().reduce((s, m) => s + m.savings, 0);
  }

  getEndBalance(): number {
    const months = this.projectedMonths();
    return months.length > 0 ? months[months.length - 1].balance : 0;
  }
}
