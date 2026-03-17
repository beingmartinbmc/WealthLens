import { Component, OnInit, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../../core/services/storage.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { ApiService } from '../../core/services/api.service';
import { Transaction, CATEGORY_LABELS, TransactionCategory } from '../../core/models/transaction.model';
import { ChatMessage } from '../../core/models/chat.model';
import { FinancialSummary } from '../../core/models/insight.model';
import { PROMPTS, buildPrompt } from '../../core/config/prompts';
import { buildLLMSummary } from '../../core/services/parsing/normalizer';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class ChatComponent implements OnInit {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  messages = signal<ChatMessage[]>([]);
  userInput = signal('');
  isProcessing = signal(false);
  transactions: Transaction[] = [];
  summary: FinancialSummary | null = null;

  suggestedQueries = [
    'Where did I spend the most?',
    'Compare my last two months',
    'How can I save more?',
    'Show my subscription costs',
    'What are my top 5 expenses?',
    'What is my savings rate?',
  ];

  useLLM = signal(true);

  constructor(
    private storage: StorageService,
    private analytics: AnalyticsService,
    private api: ApiService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.transactions = await this.storage.getAllTransactions();
    if (this.transactions.length > 0) {
      this.summary = this.analytics.computeSummary(this.transactions);
    }

    this.addMessage('assistant', 'Hi! I\'m your WealthLens financial copilot. Ask me anything about your finances. All analysis happens locally in your browser — your data never leaves your device.');
  }

  async sendMessage(text?: string): Promise<void> {
    const input = text || this.userInput().trim();
    if (!input || this.isProcessing()) return;

    this.addMessage('user', input);
    this.userInput.set('');
    this.isProcessing.set(true);

    try {
      let response: string;

      if (this.useLLM() && this.transactions.length > 0) {
        // Try LLM backend first
        const context = buildLLMSummary(this.transactions);
        const prompt = buildPrompt(PROMPTS.CHAT, {
          CONTEXT: context,
          QUESTION: input,
        });
        const result = await this.api.callGeneric(prompt, context);

        if (result.success && result.data) {
          response = result.data;
        } else {
          // Fallback to local
          response = this.processQuery(input);
        }
      } else {
        response = this.processQuery(input);
      }

      this.addMessage('assistant', response);
    } catch {
      this.addMessage('assistant', this.processQuery(input));
    } finally {
      this.isProcessing.set(false);
      this.scrollToBottom();
    }
  }

  toggleLLM(): void {
    this.useLLM.update(v => !v);
  }

  private processQuery(query: string): string {
    const lower = query.toLowerCase();

    if (this.transactions.length === 0) {
      return 'You haven\'t uploaded any statements yet. Go to the Upload page to add your bank or credit card statements, and I\'ll be able to help you analyze your finances.';
    }

    if (!this.summary) {
      this.summary = this.analytics.computeSummary(this.transactions);
    }

    // Pattern matching for common queries
    if (lower.includes('spend the most') || lower.includes('top spending') || lower.includes('highest expense') || lower.includes('top 5')) {
      return this.handleTopSpending();
    }

    if (lower.includes('compare') && (lower.includes('month') || lower.includes('last two'))) {
      return this.handleMonthComparison();
    }

    if (lower.includes('save more') || lower.includes('saving tips') || lower.includes('reduce')) {
      return this.handleSavingTips();
    }

    if (lower.includes('subscription')) {
      return this.handleSubscriptions();
    }

    if (lower.includes('savings rate') || lower.includes('saving rate')) {
      return this.handleSavingsRate();
    }

    if (lower.includes('income') || lower.includes('earn')) {
      return this.handleIncome();
    }

    if (lower.includes('expense') || lower.includes('spent') || lower.includes('spend')) {
      return this.handleExpenseSummary();
    }

    if (lower.includes('balance') || lower.includes('net')) {
      return this.handleBalance();
    }

    if (lower.includes('category') || lower.includes('breakdown')) {
      return this.handleCategoryBreakdown();
    }

    if (lower.includes('merchant') || lower.includes('where')) {
      return this.handleTopMerchants();
    }

    // Default summary
    return this.handleGeneralSummary();
  }

  private handleTopSpending(): string {
    const categories = this.summary!.topCategories.slice(0, 5);
    let response = '**Your top spending categories:**\n\n';
    categories.forEach((cat, i) => {
      response += `${i + 1}. **${cat.category}** — ₹${cat.amount.toLocaleString('en-IN')} (${cat.percentage.toFixed(1)}%)\n`;
    });
    return response;
  }

  private handleMonthComparison(): string {
    const months = this.summary!.monthOverMonth;
    if (months.length < 2) {
      return 'I need at least 2 months of data to make a comparison. Upload more statements to enable this feature.';
    }

    const latest = months[months.length - 1];
    const previous = months[months.length - 2];
    const expenseChange = previous.expenses > 0
      ? ((latest.expenses - previous.expenses) / previous.expenses * 100).toFixed(1)
      : 'N/A';
    const incomeChange = previous.income > 0
      ? ((latest.income - previous.income) / previous.income * 100).toFixed(1)
      : 'N/A';

    return `**Month Comparison: ${latest.month} vs ${previous.month}**\n\n` +
      `| Metric | ${previous.month} | ${latest.month} | Change |\n` +
      `|--------|---------|---------|--------|\n` +
      `| Income | ₹${previous.income.toLocaleString('en-IN')} | ₹${latest.income.toLocaleString('en-IN')} | ${incomeChange}% |\n` +
      `| Expenses | ₹${previous.expenses.toLocaleString('en-IN')} | ₹${latest.expenses.toLocaleString('en-IN')} | ${expenseChange}% |\n` +
      `| Savings | ₹${previous.savings.toLocaleString('en-IN')} | ₹${latest.savings.toLocaleString('en-IN')} | — |\n`;
  }

  private handleSavingTips(): string {
    const top3 = this.summary!.topCategories.slice(0, 3);
    let tips = '**Here are some ways to save more:**\n\n';

    top3.forEach(cat => {
      const reduction10 = Math.round(cat.amount * 0.1);
      tips += `- **${cat.category}** (₹${cat.amount.toLocaleString('en-IN')}): A 10% reduction saves ₹${reduction10.toLocaleString('en-IN')}\n`;
    });

    const totalSavable = top3.reduce((s, c) => s + Math.round(c.amount * 0.1), 0);
    tips += `\nBy cutting 10% across your top 3 categories, you could save an additional **₹${totalSavable.toLocaleString('en-IN')}**.`;

    if (this.summary!.savingsRate < 20) {
      tips += '\n\nYour current savings rate is below the recommended 20%. Focus on reducing discretionary spending first.';
    }

    return tips;
  }

  private handleSubscriptions(): string {
    const subCategory = this.transactions.filter(t =>
      t.type === 'debit' && t.category === 'subscriptions'
    );

    if (subCategory.length === 0) {
      return 'I didn\'t detect any subscription transactions in your data. They might be categorized under a different category.';
    }

    const merchantTotals = new Map<string, number>();
    subCategory.forEach(t => {
      merchantTotals.set(t.merchant, (merchantTotals.get(t.merchant) || 0) + t.amount);
    });

    const total = subCategory.reduce((s, t) => s + t.amount, 0);
    let response = `**Subscription Spending: ₹${total.toLocaleString('en-IN')} total**\n\n`;

    Array.from(merchantTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([merchant, amount]) => {
        response += `- **${merchant}**: ₹${amount.toLocaleString('en-IN')}\n`;
      });

    return response;
  }

  private handleSavingsRate(): string {
    const rate = this.summary!.savingsRate;
    let assessment: string;
    if (rate >= 30) assessment = 'Excellent! You\'re well above the recommended rate.';
    else if (rate >= 20) assessment = 'Good! You\'re meeting the recommended minimum.';
    else if (rate >= 10) assessment = 'Fair. Try to increase this to at least 20%.';
    else assessment = 'This needs attention. Consider cutting non-essential spending.';

    return `**Your savings rate is ${rate}%**\n\n${assessment}\n\n` +
      `- Total income: ₹${this.summary!.totalIncome.toLocaleString('en-IN')}\n` +
      `- Total expenses: ₹${this.summary!.totalExpenses.toLocaleString('en-IN')}\n` +
      `- Net savings: ₹${this.summary!.netSavings.toLocaleString('en-IN')}`;
  }

  private handleIncome(): string {
    return `**Income Summary**\n\n` +
      `- Total income: ₹${this.summary!.totalIncome.toLocaleString('en-IN')}\n` +
      `- Across ${this.summary!.monthOverMonth.length} months\n` +
      `- Average monthly: ₹${Math.round(this.summary!.totalIncome / Math.max(this.summary!.monthOverMonth.length, 1)).toLocaleString('en-IN')}`;
  }

  private handleExpenseSummary(): string {
    return `**Expense Summary**\n\n` +
      `- Total expenses: ₹${this.summary!.totalExpenses.toLocaleString('en-IN')}\n` +
      `- Monthly burn rate: ₹${this.summary!.monthlyBurnRate.toLocaleString('en-IN')}\n` +
      `- Top category: ${this.summary!.topCategories[0]?.category || 'N/A'}`;
  }

  private handleBalance(): string {
    return `**Net Balance: ₹${this.summary!.netSavings.toLocaleString('en-IN')}**\n\n` +
      `Income: ₹${this.summary!.totalIncome.toLocaleString('en-IN')}\n` +
      `Expenses: ₹${this.summary!.totalExpenses.toLocaleString('en-IN')}\n` +
      `Savings Rate: ${this.summary!.savingsRate}%`;
  }

  private handleCategoryBreakdown(): string {
    let response = '**Category Breakdown:**\n\n';
    this.summary!.topCategories.forEach(cat => {
      response += `- **${cat.category}**: ₹${cat.amount.toLocaleString('en-IN')} (${cat.percentage.toFixed(1)}%)\n`;
    });
    return response;
  }

  private handleTopMerchants(): string {
    const merchantTotals = new Map<string, number>();
    this.transactions
      .filter(t => t.type === 'debit')
      .forEach(t => {
        merchantTotals.set(t.merchant, (merchantTotals.get(t.merchant) || 0) + t.amount);
      });

    const top10 = Array.from(merchantTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    let response = '**Top 10 Merchants by Spending:**\n\n';
    top10.forEach(([merchant, amount], i) => {
      response += `${i + 1}. **${merchant}**: ₹${amount.toLocaleString('en-IN')}\n`;
    });
    return response;
  }

  private handleGeneralSummary(): string {
    return `Here's a quick summary of your finances:\n\n` +
      `- **Total Income**: ₹${this.summary!.totalIncome.toLocaleString('en-IN')}\n` +
      `- **Total Expenses**: ₹${this.summary!.totalExpenses.toLocaleString('en-IN')}\n` +
      `- **Net Savings**: ₹${this.summary!.netSavings.toLocaleString('en-IN')}\n` +
      `- **Savings Rate**: ${this.summary!.savingsRate}%\n` +
      `- **Transactions**: ${this.transactions.length}\n\n` +
      `Try asking me specific questions like "Where did I spend the most?" or "How can I save more?"`;
  }

  private addMessage(role: 'user' | 'assistant', content: string): void {
    const message: ChatMessage = {
      id: uuidv4(),
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    this.messages.update(msgs => [...msgs, message]);
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        const el = this.messagesContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}
