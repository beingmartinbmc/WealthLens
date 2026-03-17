import { Injectable } from '@angular/core';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Transaction } from '../models/transaction.model';
import { ChatSession } from '../models/chat.model';
import { Anomaly, SubscriptionDetection } from '../models/insight.model';

interface WealthLensDB extends DBSchema {
  transactions: {
    key: string;
    value: Transaction;
    indexes: {
      'by-date': string;
      'by-category': string;
      'by-account': string;
      'by-merchant': string;
      'by-source': string;
    };
  };
  categoryOverrides: {
    key: string;
    value: { merchant: string; category: string; updatedAt: string };
  };
  anomalies: {
    key: string;
    value: Anomaly;
  };
  subscriptions: {
    key: string;
    value: SubscriptionDetection;
  };
  chatSessions: {
    key: string;
    value: ChatSession;
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const DB_NAME = 'WealthLensDB';
const DB_VERSION = 1;

@Injectable({ providedIn: 'root' })
export class StorageService {
  private db: IDBPDatabase<WealthLensDB> | null = null;

  async getDB(): Promise<IDBPDatabase<WealthLensDB>> {
    if (this.db) return this.db;

    this.db = await openDB<WealthLensDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Transactions store
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('by-date', 'date');
        txStore.createIndex('by-category', 'category');
        txStore.createIndex('by-account', 'account');
        txStore.createIndex('by-merchant', 'merchant');
        txStore.createIndex('by-source', 'sourceFile');

        // Category overrides
        db.createObjectStore('categoryOverrides', { keyPath: 'merchant' });

        // Anomalies
        db.createObjectStore('anomalies', { keyPath: 'id' });

        // Subscriptions
        db.createObjectStore('subscriptions', { keyPath: 'merchant' });

        // Chat sessions
        db.createObjectStore('chatSessions', { keyPath: 'id' });

        // Settings
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });

    return this.db;
  }

  // --- Transactions ---
  async addTransactions(transactions: Transaction[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('transactions', 'readwrite');
    for (const t of transactions) {
      await tx.store.put(t);
    }
    await tx.done;
  }

  async getAllTransactions(): Promise<Transaction[]> {
    const db = await this.getDB();
    return db.getAll('transactions');
  }

  async getTransactionsByDateRange(start: string, end: string): Promise<Transaction[]> {
    const db = await this.getDB();
    return db.getAllFromIndex('transactions', 'by-date', IDBKeyRange.bound(start, end));
  }

  async getTransactionsByCategory(category: string): Promise<Transaction[]> {
    const db = await this.getDB();
    return db.getAllFromIndex('transactions', 'by-category', category);
  }

  async getTransactionsByAccount(account: string): Promise<Transaction[]> {
    const db = await this.getDB();
    return db.getAllFromIndex('transactions', 'by-account', account);
  }

  async deleteTransactionsBySource(sourceFile: string): Promise<void> {
    const db = await this.getDB();
    const txns = await db.getAllFromIndex('transactions', 'by-source', sourceFile);
    const tx = db.transaction('transactions', 'readwrite');
    for (const t of txns) {
      await tx.store.delete(t.id);
    }
    await tx.done;
  }

  async updateTransaction(transaction: Transaction): Promise<void> {
    const db = await this.getDB();
    await db.put('transactions', transaction);
  }

  async clearAllTransactions(): Promise<void> {
    const db = await this.getDB();
    await db.clear('transactions');
  }

  // --- Category Overrides ---
  async setCategoryOverride(merchant: string, category: string): Promise<void> {
    const db = await this.getDB();
    await db.put('categoryOverrides', {
      merchant,
      category,
      updatedAt: new Date().toISOString(),
    });
  }

  async getCategoryOverrides(): Promise<Map<string, string>> {
    const db = await this.getDB();
    const overrides = await db.getAll('categoryOverrides');
    const map = new Map<string, string>();
    for (const o of overrides) {
      map.set(o.merchant, o.category);
    }
    return map;
  }

  // --- Anomalies ---
  async saveAnomalies(anomalies: Anomaly[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('anomalies', 'readwrite');
    await tx.store.clear();
    for (const a of anomalies) {
      await tx.store.put(a);
    }
    await tx.done;
  }

  async getAnomalies(): Promise<Anomaly[]> {
    const db = await this.getDB();
    return db.getAll('anomalies');
  }

  // --- Subscriptions ---
  async saveSubscriptions(subs: SubscriptionDetection[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('subscriptions', 'readwrite');
    await tx.store.clear();
    for (const s of subs) {
      await tx.store.put(s);
    }
    await tx.done;
  }

  async getSubscriptions(): Promise<SubscriptionDetection[]> {
    const db = await this.getDB();
    return db.getAll('subscriptions');
  }

  // --- Chat Sessions ---
  async saveChatSession(session: ChatSession): Promise<void> {
    const db = await this.getDB();
    await db.put('chatSessions', session);
  }

  async getChatSessions(): Promise<ChatSession[]> {
    const db = await this.getDB();
    return db.getAll('chatSessions');
  }

  async deleteChatSession(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete('chatSessions', id);
  }

  // --- Settings ---
  async setSetting(key: string, value: unknown): Promise<void> {
    const db = await this.getDB();
    await db.put('settings', { key, value });
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    const db = await this.getDB();
    const result = await db.get('settings', key);
    return result?.value as T | undefined;
  }

  // --- Utility ---
  async getStats(): Promise<{ transactionCount: number; accountCount: number; sourceFiles: string[] }> {
    const db = await this.getDB();
    const txns = await db.getAll('transactions');
    const accounts = new Set(txns.map(t => t.account));
    const sources = new Set(txns.map(t => t.sourceFile));
    return {
      transactionCount: txns.length,
      accountCount: accounts.size,
      sourceFiles: Array.from(sources),
    };
  }
}
