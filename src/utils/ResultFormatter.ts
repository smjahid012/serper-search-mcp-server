/**
 * Result Formatter — SMLabs AI Serper Search MCP
 * Produces clean, structured markdown for all search types.
 */

import {
  SerperAPIResponse,
  OrganicResult,
  ImageResult,
  VideoResult,
  NewsResult,
  ShoppingResult,
  PlaceResult,
  PatentResult,
  SearchType,
  Verbosity,
} from '../types/index.js';

// Verbosity resolution: auto picks density per audience.
// dev coding → compact (~800 tok), chat → standard (KG+Box+10),
// scholar/research → full, places/shopping/images/patents → always rich.
function resolveVerbosity(requested: Verbosity | undefined, searchType: SearchType): Verbosity {
  if (requested && requested !== 'auto') return requested;
  if (searchType === 'places' || searchType === 'shopping' || searchType === 'images') return 'full';
  if (searchType === 'scholar' || searchType === 'patents') return 'full';
  return 'standard';
}

// Credit-safe fetch size: NEVER fetch 10 and show 3. Compact sends num:5.
export function effectiveFetchCount(requested: number | undefined, verbosity: Verbosity, searchType: SearchType): number {
  const def = searchType === 'places' ? 5 : 10;
  if (requested !== undefined) return Math.max(1, Math.min(requested, 20));
  if (verbosity === 'compact') return Math.min(5, def);
  return def;
}

export interface FormatOptions {
  verbosity?: Verbosity;
  maxChars?: number;
  snippetsOnly?: boolean;
  fields?: string[];
}

export class ResultFormatter {
  static format(data: SerperAPIResponse, maxResults: number, searchType: SearchType, opts: FormatOptions = {}): string {
    const verbosity = resolveVerbosity(opts.verbosity, searchType);
    const q = data.searchParameters?.q ?? '';
    const label = this.label(searchType);
    const parts: string[] = [`## ${label} Results${q ? ` — "${q}"` : ''}\n`];

    // Compact mode: skip Answer Box / KG / PAA / Related entirely (dev fast path)
    const showRich = verbosity === 'standard' || verbosity === 'full';

    // ── Answer Box (web only, skipped in compact) ────────────────────────────
    if (searchType === 'web' && showRich && data.answerBox) {
      const ab = data.answerBox;
      parts.push('### 🎯 Answer Box\n');
      if (ab.title) parts.push(`**${ab.title}**\n`);
      if (ab.snippet) parts.push(`${ab.snippet}\n`);
      if (ab.link) parts.push(`[Source](${ab.link})\n`);
      parts.push('');
    }

    // ── Knowledge Graph (web only, skipped in compact) ────────────────────────
    if (searchType === 'web' && showRich && data.knowledgeGraph) {
      const kg = data.knowledgeGraph;
      parts.push('### 🧠 Knowledge Graph\n');
      if (kg.title) parts.push(`**${kg.title}**${kg.type ? ` · ${kg.type}` : ''}\n`);
      if (kg.description) parts.push(`${kg.description}\n`);
      if (kg.website) parts.push(`[Website](${kg.website})\n`);
      if (kg.rating) parts.push(`⭐ ${kg.rating}${kg.reviewsCount ? ` (${kg.reviewsCount.toLocaleString()} reviews)` : ''}\n`);
      if (kg.attributes) {
        for (const [k, v] of Object.entries(kg.attributes)) {
          parts.push(`- **${k}:** ${v}`);
        }
        parts.push('');
      }
      parts.push('');
    }

    // ── Main results ─────────────────────────────────────────────────────────
    switch (searchType) {
      case 'web':
        parts.push(...this.formatOrganic(data.organic ?? [], maxResults, verbosity, opts));
        break;
      case 'images':
        parts.push(...this.formatImages(data.images ?? [], maxResults, opts));
        break;
      case 'videos':
        parts.push(...this.formatVideos(data.videos ?? [], maxResults));
        break;
      case 'news':
        parts.push(...this.formatNews(data.news ?? [], maxResults, verbosity));
        break;
      case 'shopping':
        parts.push(...this.formatShopping(data.shopping ?? [], maxResults));
        break;
      case 'places':
        parts.push(...this.formatPlaces(data.places ?? [], maxResults, {}));
        break;
      case 'scholar':
        parts.push(...this.formatScholar(data.organic ?? [], maxResults));
        break;
      case 'patents':
        parts.push(...this.formatPatents(data.patents ?? data.organic ?? [], maxResults));
        break;
      case 'autocomplete':
        parts.push(...this.formatAutocomplete(data.suggestions ?? [], maxResults));
        break;
    }

    // ── People Also Ask (web only, skipped in compact) ───────────────────────
    if (searchType === 'web' && showRich && data.peopleAlsoAsk?.length) {
      parts.push('\n### 💬 People Also Ask\n');
      for (const paa of data.peopleAlsoAsk.slice(0, 4)) {
        parts.push(`**Q: ${paa.question}**`);
        parts.push(`${paa.snippet}`);
        parts.push(`[Read more](${paa.link})\n`);
      }
    }

    // ── Related Searches (skipped in compact) ────────────────────────────────
    if (searchType === 'web' && showRich && data.relatedSearches?.length) {
      const rs = data.relatedSearches.slice(0, 6).map((r) => r.query);
      parts.push('\n### 🔗 Related Searches\n');
      parts.push(rs.map((r) => `- ${r}`).join('\n'));
    }

    // ── Footer: credits + provider + token/credit header ─────────────────────
    const footer: string[] = [];
    if (data.credits !== undefined) footer.push(`Serper credits used: ${data.credits}`);
    const provider = data.provider ?? 'serper';
    const cacheHit = data.cache_hit === true;
    if (verbosity === 'compact') {
      footer.push('Tokens: ~800 (compact) · upgrade with verbosity=full');
    }
    parts.push(`\n\n---\n*${[`Provider: ${provider}`, `Cache: ${cacheHit ? 'hit (0 credits)' : 'miss'}`, ...footer].join(' · ')}*`);

    let text = parts.join('\n');
    if (opts.maxChars && opts.maxChars > 0 && text.length > opts.maxChars) {
      text = text.slice(0, opts.maxChars) + `\n\n…[truncated to ${opts.maxChars.toLocaleString()} chars]`;
    }

    return text;
  }

  // ── Per-type formatters ──────────────────────────────────────────────────

  private static formatOrganic(results: OrganicResult[], max: number, verbosity: Verbosity, opts: FormatOptions): string[] {
    if (!results.length) return ['*No organic results found.*'];
    const out: string[] = ['### 🌐 Organic Results\n'];
    // Compact: 1-line snippets for dev fast path (~800 tokens)
    if (verbosity === 'compact' || opts.snippetsOnly) {
      for (const [i, r] of results.slice(0, max).entries()) {
        const snippet = (r.snippet ?? '').split('\n')[0].slice(0, 160);
        out.push(`${i + 1}. [${r.title}](${r.link}) — ${snippet}`);
      }
      return out;
    }
    for (const [i, r] of results.slice(0, max).entries()) {
      out.push(`#### ${i + 1}. [${r.title}](${r.link})`);
      if (r.date) out.push(`*${r.date}*`);
      if (r.snippet) out.push(r.snippet);
      if (r.sitelinks?.length) {
        out.push('**Sitelinks:** ' + r.sitelinks.map((s) => `[${s.title}](${s.link})`).join(' · '));
      }
      out.push('');
    }
    if (results.length > max) out.push(`*Showing ${max} of ${results.length} results.*`);
    return out;
  }

  static formatImages(results: ImageResult[], max: number, opts: FormatOptions & { layout?: string } = {}): string[] {
    if (!results.length) return ['*No image results found.*'];
    // Gallery mode: renderable thumbnails for designers (Claude Desktop / ChatGPT render ![alt](url))
    if (opts.layout === 'gallery') {
      const out: string[] = ['### 🖼️ Image Results (gallery)\n'];
      out.push('| ' + results.slice(0, max).map((r, i) => `![${r.title.slice(0, 30)}](${r.thumbnailUrl ?? r.imageUrl})`).join(' | ') + ' |');
      out.push('| ' + results.slice(0, max).map(() => '---').join(' | ') + ' |');
      out.push('| ' + results.slice(0, max).map((r) => {
        const dims = r.imageWidth && r.imageHeight ? `${r.imageWidth}×${r.imageHeight} · ` : '';
        const src = r.source ?? r.domain ?? '';
        return `${dims}${src} · [Full](${r.imageUrl})`;
      }).join(' | ') + ' |');
      void opts;
      return out;
    }
    const out: string[] = ['### 🖼️ Image Results\n'];
    for (const [i, r] of results.slice(0, max).entries()) {
      out.push(`#### ${i + 1}. ${r.title}`);
      if (r.thumbnailUrl) out.push(`![${r.title.slice(0, 60)}](${r.thumbnailUrl})`);
      out.push(`- **Image URL:** ${r.imageUrl}`);
      if (r.imageWidth && r.imageHeight) out.push(`- **Dimensions:** ${r.imageWidth}×${r.imageHeight}`);
      if (r.source) out.push(`- **Source:** ${r.source}`);
      if (r.domain) out.push(`- **Domain:** ${r.domain}`);
      if (r.link) out.push(`- **Source Page:** ${r.link}`);
      out.push('');
    }
    return out;
  }

  private static formatVideos(results: VideoResult[], max: number): string[] {
    if (!results.length) return ['*No video results found.*'];
    const out: string[] = ['### 🎬 Video Results\n'];
    for (const [i, r] of results.slice(0, max).entries()) {
      const title = r.link ? `[${r.title}](${r.link})` : r.title;
      out.push(`#### ${i + 1}. ${title}`);
      if (r.channel) out.push(`- **Channel:** ${r.channel}`);
      if (r.duration) out.push(`- **Duration:** ${r.duration}`);
      if (r.date) out.push(`- **Date:** ${r.date}`);
      if (r.snippet) out.push(`- **Description:** ${r.snippet}`);
      out.push('');
    }
    return out;
  }

  private static formatNews(results: NewsResult[], max: number, verbosity: Verbosity): string[] {
    if (!results.length) return ['*No news results found.*'];
    const out: string[] = ['### 📰 News Results\n'];
    if (verbosity === 'compact') {
      for (const [i, r] of results.slice(0, max).entries()) {
        out.push(`${i + 1}. [${r.title}](${r.link}) — ${r.source ?? ''} ${r.date ?? ''}`.trim());
      }
      return out;
    }
    for (const [i, r] of results.slice(0, max).entries()) {
      out.push(`#### ${i + 1}. [${r.title}](${r.link})`);
      const meta: string[] = [];
      if (r.source) meta.push(r.source);
      if (r.date) meta.push(r.date);
      if (meta.length) out.push(`*${meta.join(' · ')}*`);
      if (r.snippet) out.push(r.snippet);
      out.push('');
    }
    return out;
  }

  private static formatShopping(results: ShoppingResult[], max: number): string[] {
    if (!results.length) return ['*No shopping results found.*'];
    const out: string[] = ['### 🛒 Shopping Results\n'];
    for (const [i, r] of results.slice(0, max).entries()) {
      const title = r.link ? `[${r.title}](${r.link})` : r.title;
      out.push(`#### ${i + 1}. ${title}`);
      if (r.price) out.push(`- **Price:** ${r.price}`);
      if (r.source) out.push(`- **Seller:** ${r.source}`);
      if (r.rating) {
        const stars = '⭐'.repeat(Math.round(r.rating));
        out.push(`- **Rating:** ${stars} ${r.rating}${r.ratingCount ? ` (${r.ratingCount.toLocaleString()})` : ''}`);
      }
      if (r.delivery) out.push(`- **Delivery:** ${r.delivery}`);
      if (r.offers) out.push(`- **Offers:** ${r.offers}`);
      out.push('');
    }
    return out;
  }

  static formatPlaces(
    results: PlaceResult[],
    max: number,
    filters: { openNowOnly?: boolean; minRating?: number; sortBy?: 'rating' | 'reviews' } = {}
  ): string[] {
    if (!results.length) return ['*No place results found.*'];
    let list = [...results];
    // Filters for travellers / food / logistics power users
    if (filters.minRating !== undefined) list = list.filter((r) => (r.rating ?? 0) >= (filters.minRating as number));
    if (filters.sortBy === 'rating') list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    if (filters.sortBy === 'reviews') list.sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0));
    const out: string[] = ['### 📍 Place Results\n'];
    for (const [i, r] of list.slice(0, max).entries()) {
      out.push(`#### ${i + 1}. ${r.title}${r.category ? ` *${r.category}*` : ''}`);
      if (r.address) out.push(`- **Address:** ${r.address}`);
      if (r.phoneNumber) out.push(`- **Phone:** ${r.phoneNumber}`);
      if (r.website) out.push(`- **Website:** [${r.website}](${r.website})`);
      if (r.rating) {
        const stars = '⭐'.repeat(Math.round(r.rating));
        out.push(`- **Rating:** ${stars} ${r.rating}${r.ratingCount ? ` (${r.ratingCount.toLocaleString()} reviews)` : ''}`);
      }
      // Full 7-day hours (not [0]) — traveller asking "open Sunday?" must see it
      if (r.openingHours?.length) {
        out.push(`- **Hours:**`);
        for (const h of r.openingHours) out.push(`  - ${h}`);
      }
      if (r.latitude !== undefined && r.longitude !== undefined) {
        out.push(`- **Maps:** [View on Google Maps](https://www.google.com/maps?q=${r.latitude},${r.longitude}) | [Directions](https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude})`);
      } else if (r.address) {
        const q = encodeURIComponent(`${r.title} ${r.address}`);
        out.push(`- **Maps:** [Search on Google Maps](https://www.google.com/maps/search/?api=1&query=${q})`);
      }
      const pid = r.placeId ?? r.cid;
      if (pid) out.push(`- **Place ID:** ${pid}`);
      out.push('');
    }
    return out;
  }

  private static formatScholar(results: OrganicResult[], max: number): string[] {
    if (!results.length) return ['*No scholar results found.*'];
    const out: string[] = ['### 🎓 Publications\n'];
    for (const [i, r] of results.slice(0, max).entries()) {
      out.push(`#### ${i + 1}. [${r.title}](${r.link})`);
      const meta: string[] = [];
      if (r.publicationInfo) meta.push(r.publicationInfo);
      else if (r.year) meta.push(String(r.year));
      if (r.citedBy !== undefined) meta.push(`cited by ${r.citedBy}`);
      if (meta.length) out.push(`*${meta.join(' · ')}*`);
      if (r.snippet) out.push(r.snippet);
      out.push('');
    }
    if (results.length > max) out.push(`*Showing ${max} of ${results.length} results.*`);
    return out;
  }

  private static formatPatents(results: Array<PatentResult | OrganicResult>, max: number): string[] {
    if (!results.length) return ['*No patent results found.*'];
    const out: string[] = ['### 📜 Patent Results\n'];
    for (const [i, r] of results.slice(0, max).entries()) {
      const p = r as PatentResult & OrganicResult;
      const title = p.link ? `[${p.title}](${p.link})` : p.title;
      out.push(`#### ${i + 1}. ${title}`);
      const meta: string[] = [];
      if (p.publicationNumber) meta.push(p.publicationNumber);
      if (p.assignee) meta.push(p.assignee);
      if (p.inventor) meta.push(`Inventor: ${p.inventor}`);
      if (p.publicationDate ?? p.date) meta.push(String(p.publicationDate ?? p.date));
      if (meta.length) out.push(`*${meta.join(' · ')}*`);
      if (p.snippet) out.push(p.snippet);
      out.push('');
    }
    return out;
  }

  private static formatAutocomplete(suggestions: Array<{ suggestion: string } | string>, max: number): string[] {
    if (!suggestions.length) return ['*No suggestions found.*'];
    const out: string[] = ['### ⌨️ Autocomplete Suggestions\n'];
    for (const [i, s] of suggestions.slice(0, max).entries()) {
      out.push(`${i + 1}. ${typeof s === 'string' ? s : s.suggestion}`);
    }
    return out;
  }

  // ── Scrape formatter ─────────────────────────────────────────────────────

  /**
   * Format a scrape response. Prefers `markdown`, falls back to `text`,
   * then to a raw JSON dump. Truncates to maxChars for context safety.
   */
  static formatScrape(data: Record<string, unknown>, url: string, maxChars = 50_000): string {
    const markdown = typeof data['markdown'] === 'string' ? data['markdown'] : '';
    const text = typeof data['text'] === 'string' ? data['text'] : '';
    const raw = markdown || text;

    const parts: string[] = ['## 📄 Scraped Page\n', `**URL:** ${url}\n`];

    if (!raw) {
      const json = JSON.stringify(data, null, 2);
      parts.push(
        '*No markdown/text content returned. Raw response (truncated):*\n',
        '```json',
        json.slice(0, maxChars),
        '```'
      );
      return parts.join('\n');
    }

    const truncated = raw.length > maxChars;
    parts.push(truncated ? raw.slice(0, maxChars) : raw);
    if (truncated) {
      parts.push(
        `\n\n---\n*Truncated to ${maxChars.toLocaleString()} of ${raw.length.toLocaleString()} characters.*`
      );
    }
    if (typeof data['credits'] === 'number') {
      parts.push(`\n*Serper credits used: ${data['credits']}*`);
    }

    return parts.join('\n');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private static label(type: SearchType): string {
    const labels: Record<SearchType, string> = {
      web: '🌐 Web Search',
      images: '🖼️ Image Search',
      videos: '🎬 Video Search',
      news: '📰 News Search',
      shopping: '🛒 Shopping Search',
      places: '📍 Places Search',
      scholar: '🎓 Scholar Search',
      patents: '📜 Patent Search',
      autocomplete: '⌨️ Autocomplete',
    };
    return labels[type] ?? type;
  }
}
