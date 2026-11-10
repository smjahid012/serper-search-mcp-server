/**
 * Google redirect-link resolution — link_resolution modes + resolve_links tool
 * SMLabs AI · github.com/smjahid012/serper-search-mcp-server
 *
 *   auto — Serper's default (top 3 resolved). If the shown results still hold
 *          goto links, the search is kept under a search_id for resolve_links.
 *   all  — also call /resolve now (free, ~20–30 s right after a search).
 *   none — send resolveLinks:false (lowest latency, links as Google returns them).
 *
 * /resolve problems never fail a search: the original results are kept and
 * the error is reported next to them.
 */

import { randomBytes } from 'node:crypto';
import { SerperAPI } from '../api/SerperAPI.js';
import { SerperAPIResponse } from '../types/index.js';
import { ValidationError } from '../utils/errors.js';
import {
  LinkMode,
  UnresolvedState,
  countGotoLinks,
  defaultResolveMaxWaitS,
  isGotoLink,
} from '../utils/LinkResolution.js';

/** Renders a (possibly resolved) response, including any unresolved-link note. */
export type LinkRenderer = (data: SerperAPIResponse, state: UnresolvedState) => string;

export interface ResolutionContext {
  mode: LinkMode;
  /** goto links among the parts of the response the caller shows. */
  countShown: (data: SerperAPIResponse) => number;
  /** Used to re-render the search when resolve_links is called with its search_id. */
  render: LinkRenderer;
  /** Keep the search for resolve_links when goto links remain. Default: true. */
  remember?: boolean;
}

export interface Resolution extends UnresolvedState {
  data: SerperAPIResponse;
  resolveError: string | null;
}

interface CachedSearch {
  data: SerperAPIResponse;
  countShown: (data: SerperAPIResponse) => number;
  render: LinkRenderer;
}

const SEARCH_CACHE_MAX = 50;
const RESOLVE_MAX_LINKS = 100;

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

export class LinkResolver {
  private api: SerperAPI;
  // Recent searches that still contain goto links, so resolve_links can finish
  // them later without the caller re-sending the raw response. In HTTP mode
  // one resolver serves every client, so ids are random 128-bit tokens: an id
  // cannot be guessed from another one, and one from before a restart cannot
  // match a different search afterwards.
  private searches = new Map<string, CachedSearch>();

  constructor(api: SerperAPI) {
    this.api = api;
  }

  /** Apply the link-resolution mode to a search response. Never throws on /resolve failure. */
  async apply(data: SerperAPIResponse, ctx: ResolutionContext): Promise<Resolution> {
    const res: Resolution = {
      data,
      unresolved: ctx.countShown(data),
      retryAfter: null,
      resolveError: null,
      searchId: null,
    };

    if (ctx.mode === 'all' && res.unresolved) {
      try {
        const r = await this.api.resolve(data as Record<string, unknown>);
        res.data = { ...(r.data as SerperAPIResponse), credits: data.credits, provider: data.provider, cache_hit: data.cache_hit };
        res.unresolved = ctx.countShown(res.data);
        res.retryAfter = r.retryAfter;
      } catch (err) {
        res.resolveError = errMsg(err);
      }
    }

    if (res.unresolved && ctx.remember !== false) {
      res.searchId = this.remember({ data: res.data, countShown: ctx.countShown, render: ctx.render });
    }
    return res;
  }

  private remember(entry: CachedSearch): string {
    const id = randomBytes(16).toString('base64url');
    this.searches.set(id, entry);
    while (this.searches.size > SEARCH_CACHE_MAX) {
      this.searches.delete(this.searches.keys().next().value as string);
    }
    return id;
  }

  /** resolve_links tool: by search_id (re-renders that search) or by a list of goto links. */
  async resolveLinksTool(args: Record<string, unknown>): Promise<string> {
    const maxWait = Math.min(Math.max(Number(args['max_wait_seconds'] ?? defaultResolveMaxWaitS()) || 0, 0), 300);

    if (Array.isArray(args['links']) && args['links'].length) {
      const links = (args['links'] as unknown[]).map(String);
      const gotoIdx = links.map((l, i) => (isGotoLink(l) ? i : -1)).filter((i) => i >= 0);
      const resolved = new Map<number, string>();
      let unresolved = 0;
      let retryAfter: number | null = null;
      if (gotoIdx.length) {
        const r = await this.api.resolve({ links: gotoIdx.map((i) => links[i]) }, maxWait);
        const out = r.data['links'] as unknown[];
        gotoIdx.forEach((i, j) => resolved.set(i, String(out[j])));
        unresolved = r.unresolved;
        retryAfter = r.retryAfter;
      }
      const lines = [`## 🔗 Resolved ${gotoIdx.length - unresolved} of ${gotoIdx.length} Google redirect link(s) (free)\n`];
      links.forEach((l, i) => {
        const r = resolved.get(i);
        if (r === undefined) lines.push(`${i + 1}. ${l} (not a Google redirect link; unchanged)`);
        else if (isGotoLink(r)) lines.push(`${i + 1}. ⏳ not resolved yet: ${l}`);
        else lines.push(`${i + 1}. ${r}`);
      });
      if (unresolved) {
        lines.push(
          `\n${unresolved} still unresolved. Call resolve_links again with the same links` +
            `${retryAfter ? ` after ${retryAfter} s (Serper's suggestion)` : ' later'}.`
        );
      }
      return lines.join('\n');
    }

    const id = String(args['search_id']).trim();
    const entry = this.searches.get(id);
    if (!entry) {
      throw new ValidationError(
        `unknown search_id "${id}" (evicted, or from an earlier server process); re-run the search or pass links`
      );
    }
    const before = entry.countShown(entry.data);
    let attempts = 0;
    let retryAfter: number | null = null;
    if (countGotoLinks(entry.data)) {
      const r = await this.api.resolve(entry.data as Record<string, unknown>, maxWait);
      entry.data = { ...(r.data as SerperAPIResponse), credits: entry.data.credits, provider: entry.data.provider, cache_hit: entry.data.cache_hit };
      attempts = r.attempts;
      retryAfter = r.retryAfter;
    }
    const after = entry.countShown(entry.data);
    const credits = entry.data.credits;
    const status =
      `> Resolved ${before - after} of ${before} Google redirect link(s) shown ` +
      `(/resolve is free, ${attempts} call(s)` +
      `${credits !== undefined ? `; the original search used ${credits} credit(s)` : ''}).\n\n`;
    return status + entry.render(
      { ...entry.data, credits: undefined },
      { unresolved: after, searchId: after ? id : null, retryAfter }
    );
  }

  static validateArgs(a: Record<string, unknown>): void {
    const hasId = typeof a['search_id'] === 'string' && a['search_id'].trim() !== '';
    const hasLinks = Array.isArray(a['links']) && a['links'].length > 0;
    if (hasId === hasLinks) throw new ValidationError('pass exactly one of search_id or links');
    if (hasLinks) {
      const links = a['links'] as unknown[];
      if (links.length > RESOLVE_MAX_LINKS) throw new ValidationError(`at most ${RESOLVE_MAX_LINKS} links per call`);
      if (!links.every((l) => typeof l === 'string')) throw new ValidationError('links must be strings');
    }
    if (a['max_wait_seconds'] !== undefined) {
      const n = Number(a['max_wait_seconds']);
      if (!Number.isFinite(n) || n < 0 || n > 300) throw new ValidationError('max_wait_seconds must be 0-300');
    }
  }
}
