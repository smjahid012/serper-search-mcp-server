/**
 * LLM Client — supports OpenRouter + Gemini
 * User supplies their own API key via env
 *
 * Resilience: timeout + retry/backoff via fetchWithRetry
 * (SERPER_LLM_TIMEOUT_MS, default 120000ms · SERPER_LLM_RETRIES, default 2).
 */

import { fetchWithRetry } from '../utils/HttpRetry.js';

export type LLMProvider = 'openrouter' | 'gemini';

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function getLLMTimeoutMs(): number {
  return numberFromEnv('SERPER_LLM_TIMEOUT_MS', 120_000);
}

function getLLMRetries(): number {
  return Math.max(0, numberFromEnv('SERPER_LLM_RETRIES', 2));
}

interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

interface LLMResponse {
  content: string;
  provider: LLMProvider;
  model: string;
}

function detectProvider(): LLMConfig | null {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || 'google/gemini-3.1-flash-lite:free',
    };
  }
  if (process.env.GEMINI_API_KEY) {
    return {
      provider: 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    };
  }
  return null;
}

async function callOpenRouter(config: LLMConfig, prompt: string): Promise<string> {
  const res = await fetchWithRetry(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/smjahid012/serper-search-mcp-server',
        'X-Title': 'Serper Search MCP',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
      }),
    },
    { timeoutMs: getLLMTimeoutMs(), retries: getLLMRetries(), errorPrefix: 'OpenRouter error' }
  );
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(config: LLMConfig, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`;
  const res = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
    },
    { timeoutMs: getLLMTimeoutMs(), retries: getLLMRetries(), errorPrefix: 'Gemini error' }
  );
  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export async function callLLM(prompt: string): Promise<LLMResponse> {
  const config = detectProvider();
  if (!config) {
    throw new Error(
      'No LLM API key found. Set OPENROUTER_API_KEY or GEMINI_API_KEY in your environment.'
    );
  }

  let content: string;
  if (config.provider === 'openrouter') {
    content = await callOpenRouter(config, prompt);
  } else {
    content = await callGemini(config, prompt);
  }

  return { content, provider: config.provider, model: config.model! };
}

export function getLLMProvider(): LLMConfig | null {
  return detectProvider();
}
