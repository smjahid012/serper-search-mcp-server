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
  SearchType,
} from '../types/index.js';

export class ResultFormatter {
  static format(data: SerperAPIResponse, maxResults: number, searchType: SearchType): string {
    const q = data.searchParameters?.q ?? '';
    const label = this.label(searchType);
    const parts: string[] = [`## ${label} Results${q ? ` — "${q}"` : ''}\n`];

    // ── Answer Box (web only) ────────────────────────────────────────────────
    if (searchType === 'web' && data.answerBox) {
      const ab = data.answerBox;
      parts.push('### 🎯 Answer Box\n');
      if (ab.title) parts.push(`**${ab.title}**\n`);
      if (ab.snippet) parts.push(`${ab.snippet}\n`);
      if (ab.link) parts.push(`[Source](${ab.link})\n`);
      parts.push('');
    }

    // ── Knowledge Graph (web only) ───────────────────────────────────────────
    if (searchType === 'web' && data.knowledgeGraph) {
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
        parts.push(...this.formatOrganic(data.organic ?? [], maxResults));
        break;
      case 'images':
        parts.push(...this.formatImages(data.images ?? [], maxResults));
        break;
      case 'videos':
        parts.push(...this.formatVideos(data.videos ?? [], maxResults));
        break;
      case 'news':
        parts.push(...this.formatNews(data.news ?? [], maxResults));
        break;
      case 'shopping':
        parts.push(...this.formatShopping(data.shopping ?? [], maxResults));
        break;
      case 'places':
        parts.push(...this.formatPlaces(data.places ?? [], maxResults));
        break;
    }

    // ── People Also Ask (web only) ───────────────────────────────────────────
    if (searchType === 'web' && data.peopleAlsoAsk?.length) {
      parts.push('\n### 💬 People Also Ask\n');
      for (const paa of data.peopleAlsoAsk.slice(0, 4)) {
        parts.push(`**Q: ${paa.question}**`);
        parts.push(`${paa.snippet}`);
        parts.push(`[Read more](${paa.link})\n`);
      }
    }

    // ── Related Searches ─────────────────────────────────────────────────────
    if (searchType === 'web' && data.relatedSearches?.length) {
      const rs = data.relatedSearches.slice(0, 6).map((r) => r.query);
      parts.push('\n### 🔗 Related Searches\n');
      parts.push(rs.map((r) => `- ${r}`).join('\n'));
    }

    // ── Credits ──────────────────────────────────────────────────────────────
    if (data.credits !== undefined) {
      parts.push(`\n\n---\n*Serper credits used: ${data.credits}*`);
    }

    return parts.join('\n');
  }

  // ── Per-type formatters ──────────────────────────────────────────────────

  private static formatOrganic(results: OrganicResult[], max: number): string[] {
    if (!results.length) return ['*No organic results found.*'];
    const out: string[] = ['### 🌐 Organic Results\n'];
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

  private static formatImages(results: ImageResult[], max: number): string[] {
    if (!results.length) return ['*No image results found.*'];
    const out: string[] = ['### 🖼️ Image Results\n'];
    for (const [i, r] of results.slice(0, max).entries()) {
      out.push(`#### ${i + 1}. ${r.title}`);
      out.push(`- **Image URL:** ${r.imageUrl}`);
      if (r.imageWidth && r.imageHeight) out.push(`- **Dimensions:** ${r.imageWidth}×${r.imageHeight}`);
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

  private static formatNews(results: NewsResult[], max: number): string[] {
    if (!results.length) return ['*No news results found.*'];
    const out: string[] = ['### 📰 News Results\n'];
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

  private static formatPlaces(results: PlaceResult[], max: number): string[] {
    if (!results.length) return ['*No place results found.*'];
    const out: string[] = ['### 📍 Place Results\n'];
    for (const [i, r] of results.slice(0, max).entries()) {
      out.push(`#### ${i + 1}. ${r.title}`);
      if (r.category) out.push(`*${r.category}*`);
      if (r.address) out.push(`- **Address:** ${r.address}`);
      if (r.phoneNumber) out.push(`- **Phone:** ${r.phoneNumber}`);
      if (r.website) out.push(`- **Website:** [${r.website}](${r.website})`);
      if (r.rating) {
        const stars = '⭐'.repeat(Math.round(r.rating));
        out.push(`- **Rating:** ${stars} ${r.rating}${r.ratingCount ? ` (${r.ratingCount.toLocaleString()} reviews)` : ''}`);
      }
      if (r.openingHours?.length) {
        out.push(`- **Hours:** ${r.openingHours[0]}${r.openingHours.length > 1 ? ' …' : ''}`);
      }
      if (r.latitude && r.longitude) {
        out.push(`- **Maps:** [View on Google Maps](https://www.google.com/maps?q=${r.latitude},${r.longitude})`);
      }
      out.push('');
    }
    return out;
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
    };
    return labels[type] ?? type;
  }
}
