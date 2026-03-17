export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    queryType?: 'comparison' | 'summary' | 'recommendation' | 'search' | 'general';
    relatedTransactionIds?: string[];
    chartData?: unknown;
  };
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export type PrivacyMode = 'strict' | 'hybrid';
