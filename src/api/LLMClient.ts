/**
 * LLM Client — supports OpenRouter + Gemini
 * User supplies their own API key via env
 */

export type LLMProvider = 'openrouter' | 'gemini';

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
      model: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free',
    };
  }
  if (process.env.GEMINI_API_KEY) {
    return {
      provider: 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    };
  }
  return null;
}

async function callOpenRouter(config: LLMConfig, prompt: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
  });
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(config: LLMConfig, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
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
