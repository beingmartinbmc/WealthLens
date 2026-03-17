/**
 * Centralized API URL configuration.
 * All external endpoints used by WealthLens are defined here.
 */

const BACKEND_BASE = 'https://epic-backend-f9tfcyn1d-beingmartinbmcs-projects.vercel.app';

export const API_URLS = {
  /** Generic LLM proxy endpoint — accepts { prompt, context } */
  generic: `${BACKEND_BASE}/api/generic`,
} as const;

export type ApiEndpoint = keyof typeof API_URLS;
