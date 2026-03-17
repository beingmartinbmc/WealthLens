import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { StorageService } from '../../core/services/storage.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { ApiService } from '../../core/services/api.service';
import { Transaction } from '../../core/models/transaction.model';
import { TaxInsight } from '../../core/models/insight.model';
import { buildLLMSummary } from '../../core/services/parsing/normalizer';
import { PROMPTS, buildPrompt } from '../../core/config/prompts';

@Component({
  selector: 'app-tax',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tax.html',
  styleUrl: './tax.scss',
})
export class TaxComponent implements OnInit {
  taxInsight = signal<TaxInsight | null>(null);
  loading = signal(true);
  hasData = signal(false);

  aiTaxTips = signal<string[]>([]);

  constructor(
    private storage: StorageService,
    private analytics: AnalyticsService,
    private api: ApiService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    const txns = await this.storage.getAllTransactions();
    this.hasData.set(txns.length > 0);

    if (txns.length > 0) {
      const insight = this.analytics.computeTaxInsights(txns);
      this.taxInsight.set(insight);
      this.fetchAITaxInsights(txns);
    }

    this.loading.set(false);
  }

  formatCurrency(amount: number): string {
    return '₹' + amount.toLocaleString('en-IN');
  }

  getTotalDeductions(): number {
    const insight = this.taxInsight();
    if (!insight) return 0;
    return insight.possibleDeductions.reduce((s, d) => s + d.amount, 0);
  }

  getEstimatedTaxable(): number {
    const insight = this.taxInsight();
    if (!insight) return 0;
    return Math.max(0, insight.estimatedTaxableIncome - this.getTotalDeductions());
  }

  goToUpload(): void {
    this.router.navigate(['/upload']);
  }

  private async fetchAITaxInsights(txns: Transaction[]): Promise<void> {
    try {
      const context = buildLLMSummary(txns);
      const prompt = buildPrompt(PROMPTS.TAX_INSIGHTS, { CONTEXT: context });
      const result = await this.api.callGeneric(prompt, context);

      if (!result.success || !result.data) return;

      const parsed = this.api.parseJsonResponse<
        { section: string; amount: number; description: string }[]
      >(result.data);

      if (!parsed || !Array.isArray(parsed)) return;

      this.aiTaxTips.set(
        parsed.map(t => `${t.section}: ${t.description} (₹${t.amount.toLocaleString('en-IN')})`)
      );
    } catch {
      // Silently fail — local tax insights are already displayed
    }
  }
}
