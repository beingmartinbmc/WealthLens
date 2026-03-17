import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import { Transaction, ColumnMapping, ParsedStatement } from '../models/transaction.model';
import { CategorizationService } from './categorization.service';
import { parseDate } from './parsing/date-parser';
import { parseAmount } from './parsing/amount-parser';
import { cleanMerchant } from './parsing/merchant-cleaner';
import { detectBank } from './parsing/bank-detector';
import { deduplicateTransactions } from './parsing/deduplicator';

@Injectable({ providedIn: 'root' })
export class CsvParserService {
  constructor(private categorization: CategorizationService) {}

  async parseCSV(
    file: File,
    columnMapping?: ColumnMapping,
    accountName?: string
  ): Promise<ParsedStatement> {
    const text = await file.text();
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      transformHeader: (header: string) => header.trim(),
    });

    const errors: string[] = [];
    let transactions: Transaction[] = [];
    const headers = result.meta.fields || [];

    // Auto-detect column mapping if not provided
    const mapping = columnMapping || this.autoDetectMapping(headers);

    if (!mapping.date || !mapping.description) {
      errors.push('Could not detect required columns (date, description). Please provide column mapping.');
      return this.buildResult(file.name, accountName || 'Unknown', 'bank', [], errors, 0);
    }

    // Detect bank from file content
    const sampleText = (result.data as Record<string, string>[]).slice(0, 5)
      .map((r: Record<string, string>) => Object.values(r).join(' '))
      .join(' ');
    const detection = detectBank(sampleText + ' ' + file.name);
    const bankName = accountName || detection.bank;
    const accountType = detection.accountType;

    for (let i = 0; i < result.data.length; i++) {
      const row = result.data[i] as Record<string, string>;

      try {
        const date = parseDate(row[mapping.date]);
        if (!date) {
          errors.push(`Row ${i + 1}: Invalid date "${row[mapping.date]}"`);
          continue;
        }

        const rawDescription = (row[mapping.description] || '').trim();
        if (!rawDescription) continue;

        let amount = 0;
        let type: 'debit' | 'credit' = 'debit';

        if (mapping.debit && mapping.credit) {
          const debitVal = Math.abs(parseAmount(row[mapping.debit]));
          const creditVal = Math.abs(parseAmount(row[mapping.credit]));
          if (creditVal > 0) {
            amount = creditVal;
            type = 'credit';
          } else {
            amount = debitVal;
            type = 'debit';
          }
        } else if (mapping.amount) {
          const raw = parseAmount(row[mapping.amount]);
          amount = Math.abs(raw);
          if (mapping.type) {
            const typeVal = (row[mapping.type] || '').toLowerCase().trim();
            type = typeVal.includes('cr') || typeVal.includes('credit') ? 'credit' : 'debit';
          } else {
            type = raw < 0 ? 'debit' : 'credit';
          }
        }

        if (amount === 0) continue;

        const merchant = cleanMerchant(rawDescription);
        const category = this.categorization.categorize(rawDescription, merchant);
        const balance = mapping.balance ? parseAmount(row[mapping.balance]) : null;

        transactions.push({
          id: uuidv4(),
          date,
          amount,
          type,
          description: rawDescription,
          rawDescription,
          merchant,
          category,
          account: bankName,
          accountType,
          sourceFile: file.name,
          balance: balance || null,
        });
      } catch (e) {
        errors.push(`Row ${i + 1}: Parse error - ${e}`);
      }
    }

    // Deduplicate
    const dedupResult = deduplicateTransactions(transactions);
    transactions = dedupResult.unique;
    if (dedupResult.duplicatesRemoved > 0) {
      errors.push(`Removed ${dedupResult.duplicatesRemoved} duplicate transaction(s).`);
    }

    return this.buildResult(file.name, bankName, accountType, transactions, errors, dedupResult.duplicatesRemoved);
  }

  getHeaders(file: File): Promise<string[]> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const firstLine = text.split('\n')[0];
        const result = Papa.parse(firstLine, { header: false });
        resolve((result.data[0] as string[]).map(h => h.trim()));
      };
      reader.readAsText(file);
    });
  }

  private autoDetectMapping(headers: string[]): ColumnMapping {
    const lower = headers.map(h => h.toLowerCase());
    const mapping: ColumnMapping = { date: '', description: '', amount: '' };

    // Date column
    const datePatterns = [
      'txn date', 'transaction date', 'value date', 'posting date', 'date',
    ];
    for (const pattern of datePatterns) {
      const idx = lower.findIndex(h => h.includes(pattern));
      if (idx >= 0) { mapping.date = headers[idx]; break; }
    }

    // Description column
    const descPatterns = [
      'narration', 'particulars', 'description', 'transaction details',
      'details', 'remarks',
    ];
    for (const pattern of descPatterns) {
      const idx = lower.findIndex(h => h.includes(pattern));
      if (idx >= 0) { mapping.description = headers[idx]; break; }
    }

    // Amount / Debit / Credit columns
    const debitIdx = lower.findIndex(h =>
      h.includes('debit') || h.includes('withdrawal') || h === 'dr'
    );
    const creditIdx = lower.findIndex(h =>
      h.includes('credit') || h.includes('deposit') || h === 'cr'
    );

    if (debitIdx >= 0 && creditIdx >= 0) {
      mapping.debit = headers[debitIdx];
      mapping.credit = headers[creditIdx];
    } else {
      const amtPatterns = ['transaction amount', 'amount', 'amt'];
      for (const pattern of amtPatterns) {
        const idx = lower.findIndex(h => h.includes(pattern));
        if (idx >= 0) { mapping.amount = headers[idx]; break; }
      }
    }

    // Type column
    const typeIdx = lower.findIndex(h => h === 'type' || h === 'dr/cr' || h === 'cr/dr');
    if (typeIdx >= 0) {
      mapping.type = headers[typeIdx];
    }

    // Balance column
    const balIdx = lower.findIndex(h =>
      h.includes('closing balance') || h.includes('balance') || h.includes('running')
    );
    if (balIdx >= 0) { mapping.balance = headers[balIdx]; }

    return mapping;
  }

  private buildResult(
    fileName: string,
    account: string,
    accountType: 'bank' | 'credit_card',
    transactions: Transaction[],
    errors: string[],
    duplicatesRemoved: number,
  ): ParsedStatement {
    return {
      fileName,
      fileType: 'csv',
      account,
      accountType,
      transactions,
      parseDate: new Date().toISOString(),
      errors,
      duplicatesRemoved,
    };
  }
}
