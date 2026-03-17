import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CsvParserService } from '../../core/services/csv-parser.service';
import { PdfParserService } from '../../core/services/pdf-parser.service';
import { StorageService } from '../../core/services/storage.service';
import { ApiService } from '../../core/services/api.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { ParsedStatement, ColumnMapping, Transaction } from '../../core/models/transaction.model';
import { buildLLMSummary } from '../../core/services/parsing/normalizer';
import { PROMPTS, buildPrompt } from '../../core/config/prompts';

interface UploadedFile {
  file: File;
  status: 'pending' | 'parsing' | 'done' | 'error';
  result?: ParsedStatement;
  error?: string;
  accountName: string;
}

interface AIEnrichment {
  status: 'idle' | 'running' | 'done' | 'error';
  insights: string[];
  error?: string;
}

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class UploadComponent {
  files = signal<UploadedFile[]>([]);
  isDragging = signal(false);
  showColumnMapper = signal(false);
  currentMappingFile = signal<UploadedFile | null>(null);
  csvHeaders = signal<string[]>([]);
  columnMapping = signal<ColumnMapping>({ date: '', description: '', amount: '' });
  totalTransactions = computed(() =>
    this.files().reduce((sum, f) => sum + (f.result?.transactions.length || 0), 0)
  );
  allDone = computed(() =>
    this.files().length > 0 && this.files().every(f => f.status === 'done' || f.status === 'error')
  );
  aiEnrichment = signal<AIEnrichment>({ status: 'idle', insights: [] });

  constructor(
    private csvParser: CsvParserService,
    private pdfParser: PdfParserService,
    private storage: StorageService,
    private api: ApiService,
    private analytics: AnalyticsService,
    private router: Router
  ) {}

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles) {
      this.addFiles(droppedFiles);
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(input.files);
      input.value = '';
    }
  }

  private addFiles(fileList: FileList): void {
    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'csv' || ext === 'pdf') {
        newFiles.push({
          file,
          status: 'pending',
          accountName: '',
        });
      }
    }
    this.files.update(existing => [...existing, ...newFiles]);
  }

  removeFile(index: number): void {
    this.files.update(files => files.filter((_, i) => i !== index));
  }

  async parseAll(): Promise<void> {
    const current = this.files();
    for (let i = 0; i < current.length; i++) {
      if (current[i].status !== 'pending') continue;
      await this.parseFile(i);
    }

    // Auto-trigger AI enrichment on parsed transactions
    const allTxns = this.files()
      .filter(f => f.result)
      .flatMap(f => f.result!.transactions);

    if (allTxns.length > 0) {
      this.triggerAIEnrichment(allTxns);
    }
  }

  async parseFile(index: number): Promise<void> {
    this.files.update(files => {
      const updated = [...files];
      updated[index] = { ...updated[index], status: 'parsing' };
      return updated;
    });

    const fileEntry = this.files()[index];
    const ext = fileEntry.file.name.split('.').pop()?.toLowerCase();

    try {
      let result: ParsedStatement;
      if (ext === 'csv') {
        result = await this.csvParser.parseCSV(
          fileEntry.file,
          undefined,
          fileEntry.accountName || undefined
        );
      } else {
        result = await this.pdfParser.parsePDF(
          fileEntry.file,
          fileEntry.accountName || undefined
        );
      }

      this.files.update(files => {
        const updated = [...files];
        updated[index] = {
          ...updated[index],
          status: result.transactions.length > 0 ? 'done' : 'error',
          result,
          error: result.transactions.length === 0
            ? result.errors.join('; ') || 'No transactions found'
            : undefined,
        };
        return updated;
      });
    } catch (e) {
      this.files.update(files => {
        const updated = [...files];
        updated[index] = { ...updated[index], status: 'error', error: String(e) };
        return updated;
      });
    }
  }

  async saveAndContinue(): Promise<void> {
    const allTransactions = this.files()
      .filter(f => f.result)
      .flatMap(f => f.result!.transactions);

    if (allTransactions.length > 0) {
      await this.storage.addTransactions(allTransactions);
      this.router.navigate(['/dashboard']);
    }
  }

  getFileIcon(fileName: string): string {
    return fileName.endsWith('.pdf') ? '📄' : '📋';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  private async triggerAIEnrichment(transactions: Transaction[]): Promise<void> {
    this.aiEnrichment.set({ status: 'running', insights: [] });

    try {
      const context = buildLLMSummary(transactions);
      const prompt = buildPrompt(PROMPTS.INSIGHTS, { CONTEXT: context });
      const result = await this.api.callGeneric(prompt, context);

      if (result.success && result.data) {
        const parsed = this.api.parseJsonResponse<
          { title: string; message: string }[]
        >(result.data);

        if (parsed && Array.isArray(parsed)) {
          this.aiEnrichment.set({
            status: 'done',
            insights: parsed.map(i => `${i.title}: ${i.message}`),
          });
          return;
        }

        // If not JSON, treat the raw text as a single insight
        this.aiEnrichment.set({
          status: 'done',
          insights: [result.data],
        });
      } else {
        this.aiEnrichment.set({
          status: 'error',
          insights: [],
          error: result.error || 'AI enrichment failed',
        });
      }
    } catch (e) {
      this.aiEnrichment.set({
        status: 'error',
        insights: [],
        error: String(e),
      });
    }
  }
}
