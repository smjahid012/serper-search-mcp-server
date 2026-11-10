/**
 * Google redirect links (google.com/goto) — SMLabs AI
 *
 * Since 2026-10-30 Google only lets the first few result links of a fresh
 * results page be followed. Serper resolves the top 3; the rest may come back
 * as https://www.google.com/goto?url=… links, which hit Google's "Verifying
 * your request" page if opened right away. POSTing the search response (or
 * {"links": [...]}) to /resolve (0 credits) returns real URLs. Links that are
 * not ready yet stay goto links and the reply carries `retryAfter` (seconds).
 * See https://serper.dev/google-links.
 */

import { SearchType, SerperAPIResponse, Verbosity } from '../types/index.js';

export type LinkMode = 'auto' | 'all' | 'none';
export const LINK_MODES: readonly LinkMode[] = ['auto', 'all', 'none'];

const GOTO_RE = /^https?:\/\/(www\.)?google\.[a-z.]+\/goto\?/i;

export const isGotoLink = (s: unknown): s is string => typeof s === 'string' && GOTO_RE.test(s);

/** Count goto links anywhere in a JSON value. */
export function countGotoLinks(node: unknown): number {
  if (typeof node === 'string') return isGotoLink(node) ? 1 : 0;
  if (Array.isArray(node)) return node.reduce((n: number, x) => n + countGotoLinks(x), 0);
  if (node && typeof node === 'object') {
    return Object.values(node).reduce((n: number, x) => n + countGotoLinks(x), 0);
  }
  return 0;
}

/** Default mode for tools called without link_resolution (SERPER_LINK_RESOLUTION, default auto). */
export function defaultLinkMode(): LinkMode {
  const env = process.env.SERPER_LINK_RESOLUTION as LinkMode | undefined;
  return env && LINK_MODES.includes(env) ? env : 'auto';
}

/** Seconds /resolve may keep retrying when Serper says to wait (SERPER_RESOLVE_MAX_WAIT, default 60). */
export function defaultResolveMaxWaitS(): number {
  const v = parseInt(process.env.SERPER_RESOLVE_MAX_WAIT ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : 60;
}

/**
 * Goto links among the results ResultFormatter actually renders for this
 * search type, result count and verbosity.
 */
export function shownGotoCount(
  data: SerperAPIResponse,
  searchType: SearchType,
  maxResults: number,
  verbosity: Verbosity = 'auto'
): number {
  const main: Record<SearchType, unknown[] | undefined> = {
    web: data.organic,
    images: data.images,
    videos: data.videos,
    news: data.news,
    shopping: data.shopping,
    places: data.places,
    scholar: data.organic,
    patents: data.patents ?? data.organic,
    autocomplete: undefined,
  };
  let n = countGotoLinks((main[searchType] ?? []).slice(0, maxResults));
  if (searchType === 'web' && verbosity !== 'compact') {
    n += countGotoLinks([
      data.answerBox?.link,
      data.knowledgeGraph?.website,
      ...(data.peopleAlsoAsk ?? []).slice(0, 4).map((p) => p.link),
    ]);
  }
  return n;
}

/**
 * /resolve answers 200 and echoes whatever it is sent, so a reply that lost a
 * result array would otherwise read as "no goto links left = all resolved".
 * Every array in the request must come back as an array of the same length.
 */
export function checkResolveShape(sent: Record<string, unknown>, out: unknown): asserts out is Record<string, unknown> {
  if (!out || typeof out !== 'object' || Array.isArray(out)) {
    throw new Error('/resolve returned a non-object reply');
  }
  const o = out as Record<string, unknown>;
  for (const [k, v] of Object.entries(sent)) {
    if (Array.isArray(v) && (!Array.isArray(o[k]) || (o[k] as unknown[]).length !== v.length)) {
      throw new Error(`/resolve reply is missing or changed "${k}" (sent ${v.length} items)`);
    }
  }
}

export interface UnresolvedState {
  unresolved: number;
  searchId: string | null;
  retryAfter: number | null;
  resolveError?: string | null;
}

/** Markdown note appended to a result that still shows goto links. Empty when there are none. */
export function unresolvedNote({ unresolved, searchId, retryAfter, resolveError }: UnresolvedState): string {
  if (!unresolved) return '';
  const parts = [
    `\n\n> ⚠️ **${unresolved} of the links above are Google redirects** (\`google.com/goto?…\`), not real URLs. ` +
      'Opening them right after the search lands on Google\'s "Verifying your request" page.',
  ];
  if (resolveError) parts.push(`> /resolve failed: ${resolveError}`);
  if (searchId) {
    parts.push(
      `> Call \`resolve_links\` with \`search_id: "${searchId}"\` to get the real URLs ` +
        `(free, ~30 s after the search${retryAfter ? `; Serper suggested waiting ${retryAfter} s before retrying` : ''}).`
    );
  }
  return parts.join('\n');
}
