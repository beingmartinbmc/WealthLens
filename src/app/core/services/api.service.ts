import { Injectable } from '@angular/core';
import { API_URLS } from '../config/api.config';
import { PROMPTS, PromptKey, buildPrompt } from '../config/prompts';

export interface ApiResponse<T = string> {
  success: boolean;
  data: T;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {

  /**
   * Send a raw prompt + context to the generic LLM endpoint.
   */
  async callGeneric(prompt: string, context: string): Promise<ApiResponse> {
    try {
      const res = await fetch(API_URLS.generic, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context }),
      });

      if (!res.ok) {
        return { success: false, data: '', error: `HTTP ${res.status}: ${res.statusText}` };
      }

      const json = await res.json();
      return { success: true, data: json.response ?? json.data ?? JSON.stringify(json) };
    } catch (e) {
      return { success: false, data: '', error: String(e) };
    }
  }

  /**
   * Send a templated prompt with variable interpolation.
   * @param promptKey  Key from PROMPTS config
   * @param variables  Values to inject into {{PLACEHOLDERS}}
   * @param context    Financial context string sent alongside the prompt
   */
  async callWithPrompt(
    promptKey: PromptKey,
    variables: Record<string, string>,
    context?: string,
  ): Promise<ApiResponse> {
    const template = PROMPTS[promptKey];
    const prompt = buildPrompt(template, variables);
    return this.callGeneric(prompt, context ?? '');
  }

  /**
   * Parse a JSON response from the LLM. Falls back gracefully on parse errors.
   */
  parseJsonResponse<T>(raw: string): T | null {
    try {
      // LLM sometimes wraps JSON in markdown code blocks
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      return JSON.parse(cleaned) as T;
    } catch {
      return null;
    }
  }
}
