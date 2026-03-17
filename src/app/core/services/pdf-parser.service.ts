import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import * as pdfjsLib from 'pdfjs-dist';
import { Transaction, ParsedStatement } from '../models/transaction.model';
import { CategorizationService } from './categorization.service';
import {
  extractPdfLines,
  extractPdfFlatText,
  detectBank,
  extractRows,
  extractRowsFromText,
  refineBankRows,
  inferTypesFromBalance,
  cleanMerchant,
  deduplicateTransactions,
} from './parsing';
import type { RawRow } from './parsing';

@Injectable({ providedIn: 'root' })
export class PdfParserService {
  constructor(private categorization: CategorizationService) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.mjs';
  }

  async parsePDF(file: File, accountName?: string): Promise<ParsedStatement> {
    const errors: string[] = [];
    let transactions: Transaction[] = [];

    try {
      const arrayBuffer = await file.arrayBuffer();

      // Step 1: Detect bank & account type from flat text (fast scan)
      const flatText = await extractPdfFlatText(arrayBuffer);
      const detection = detectBank(flatText);
      const bankName = accountName || detection.bank;
      const accountType = detection.accountType;

      // Step 2: Position-aware line extraction
      let rows: RawRow[];
      try {
        const lines = await extractPdfLines(arrayBuffer);
        rows = extractRows(lines);
      } catch {
        // Fallback to flat text extraction
        rows = extractRowsFromText(flatText);
        if (rows.length === 0) {
          errors.push('Position-aware extraction failed, fell back to flat text.');
        }
      }

      // Step 3: If position-aware found nothing, try flat text
      if (rows.length === 0) {
        rows = extractRowsFromText(flatText);
      }

      if (rows.length === 0) {
        errors.push(
          'Could not extract transactions from this PDF. ' +
          'The format may not be supported. Try exporting as CSV from your bank.'
        );
        return this.buildResult(file.name, bankName, accountType, [], errors, 0);
      }

      // Step 4: Apply bank-specific heuristics
      rows = refineBankRows(rows, bankName, accountType);

      // Step 5: Infer debit/credit from running balance where possible
      rows = inferTypesFromBalance(rows);

      // Step 6: Convert RawRows → Transaction objects
      transactions = rows.map(row => this.rowToTransaction(row, bankName, accountType, file.name));

      // Step 7: Deduplicate
      const dedupResult = deduplicateTransactions(transactions);
      transactions = dedupResult.unique;

      if (dedupResult.duplicatesRemoved > 0) {
        errors.push(`Removed ${dedupResult.duplicatesRemoved} duplicate transaction(s).`);
      }

      return this.buildResult(file.name, bankName, accountType, transactions, errors, dedupResult.duplicatesRemoved);
    } catch (e) {
      errors.push(`Failed to parse PDF: ${e}`);
      return this.buildResult(file.name, accountName || 'Unknown', 'bank', [], errors, 0);
    }
  }

  private rowToTransaction(
    row: RawRow,
    account: string,
    accountType: 'bank' | 'credit_card',
    fileName: string,
  ): Transaction {
    const merchant = cleanMerchant(row.description);
    const category = this.categorization.categorize(row.description, merchant);

    return {
      id: uuidv4(),
      date: row.date,
      amount: row.amount,
      type: row.type || 'debit',
      description: row.description,
      rawDescription: row.rawText,
      merchant,
      category,
      account,
      accountType,
      sourceFile: fileName,
      balance: row.balance,
    };
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
      fileType: 'pdf',
      account,
      accountType,
      transactions,
      parseDate: new Date().toISOString(),
      errors,
      duplicatesRemoved,
    };
  }
}
