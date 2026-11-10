#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/utils/Logger.ts
function normalizeLevel(value) {
  const v = (value ?? "").toLowerCase();
  return v in LEVEL_ORDER ? v : "info";
}
function setLogLevel(level) {
  current = normalizeLevel(level);
}
function setRequestId(id) {
  requestId = id;
}
function emit(level, args) {
  if (LEVEL_ORDER[level] > LEVEL_ORDER[current]) return;
  const prefix = requestId ? `[serper-mcp][${requestId}]` : "[serper-mcp]";
  console.error(prefix, ...args);
}
var LEVEL_ORDER, current, requestId, logger;
var init_Logger = __esm({
  "src/utils/Logger.ts"() {
    "use strict";
    LEVEL_ORDER = {
      silent: -1,
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    current = normalizeLevel(process.env.SERPER_MCP_LOG_LEVEL);
    requestId = "";
    logger = {
      error: (...args) => emit("error", args),
      warn: (...args) => emit("warn", args),
      info: (...args) => emit("info", args),
      debug: (...args) => emit("debug", args)
    };
  }
});

// src/utils/HttpRetry.ts
function parseRetryAfter(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(seconds * 1e3, 0), MAX_DELAY_MS);
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(date - Date.now(), 0), MAX_DELAY_MS);
  }
  return null;
}
async function fetchWithRetry(url, init, options = {}) {
  const timeoutMs = options.timeoutMs ?? 3e4;
  const retries = Math.max(0, options.retries ?? 2);
  const baseDelayMs = options.baseDelayMs ?? 500;
  const prefix = options.errorPrefix ?? "HTTP error";
  let lastError = new Error(`${prefix}: request failed`);
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response = null;
    let failure = null;
    let retryAfterMs = null;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      failure = new Error(
        aborted ? `${prefix}: request timed out after ${timeoutMs}ms` : `${prefix}: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      clearTimeout(timer);
    }
    if (response) {
      if (response.ok) return response;
      const msg = await response.text().catch(() => response.statusText);
      failure = new Error(`${prefix} ${response.status}: ${msg}`);
      failure.status = response.status;
      if (!isRetryableStatus(response.status)) throw failure;
      retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
    }
    lastError = failure;
    if (attempt < retries) {
      const delay = retryAfterMs ?? Math.min(baseDelayMs * 2 ** attempt, MAX_DELAY_MS);
      const jitter = Math.floor(Math.random() * JITTER_MS);
      logger.warn(
        `${lastError.message} \u2014 retrying in ${delay + jitter}ms (attempt ${attempt + 2}/${retries + 1})`
      );
      await sleep(delay + jitter);
    }
  }
  throw lastError;
}
var MAX_DELAY_MS, JITTER_MS, isRetryableStatus, sleep;
var init_HttpRetry = __esm({
  "src/utils/HttpRetry.ts"() {
    "use strict";
    init_Logger();
    MAX_DELAY_MS = 1e4;
    JITTER_MS = 250;
    isRetryableStatus = (status) => status === 429 || status >= 500;
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  }
});

// src/utils/LinkResolution.ts
function countGotoLinks(node) {
  if (typeof node === "string") return isGotoLink(node) ? 1 : 0;
  if (Array.isArray(node)) return node.reduce((n, x) => n + countGotoLinks(x), 0);
  if (node && typeof node === "object") {
    return Object.values(node).reduce((n, x) => n + countGotoLinks(x), 0);
  }
  return 0;
}
function defaultLinkMode() {
  const env = process.env.SERPER_LINK_RESOLUTION;
  return env && LINK_MODES.includes(env) ? env : "auto";
}
function defaultResolveMaxWaitS() {
  const v = parseInt(process.env.SERPER_RESOLVE_MAX_WAIT ?? "", 10);
  return Number.isFinite(v) && v >= 0 ? v : 60;
}
function shownGotoCount(data, searchType, maxResults, verbosity = "auto") {
  const main2 = {
    web: data.organic,
    images: data.images,
    videos: data.videos,
    news: data.news,
    shopping: data.shopping,
    places: data.places,
    scholar: data.organic,
    patents: data.patents ?? data.organic,
    autocomplete: void 0
  };
  let n = countGotoLinks((main2[searchType] ?? []).slice(0, maxResults));
  if (searchType === "web" && verbosity !== "compact") {
    n += countGotoLinks([
      data.answerBox?.link,
      data.knowledgeGraph?.website,
      ...(data.peopleAlsoAsk ?? []).slice(0, 4).map((p) => p.link)
    ]);
  }
  return n;
}
function checkResolveShape(sent, out) {
  if (!out || typeof out !== "object" || Array.isArray(out)) {
    throw new Error("/resolve returned a non-object reply");
  }
  const o = out;
  for (const [k, v] of Object.entries(sent)) {
    if (Array.isArray(v) && (!Array.isArray(o[k]) || o[k].length !== v.length)) {
      throw new Error(`/resolve reply is missing or changed "${k}" (sent ${v.length} items)`);
    }
  }
}
function unresolvedNote({ unresolved, searchId, retryAfter, resolveError }) {
  if (!unresolved) return "";
  const parts = [
    `

> \u26A0\uFE0F **${unresolved} of the links above are Google redirects** (\`google.com/goto?\u2026\`), not real URLs. Opening them right after the search lands on Google's "Verifying your request" page.`
  ];
  if (resolveError) parts.push(`> /resolve failed: ${resolveError}`);
  if (searchId) {
    parts.push(
      `> Call \`resolve_links\` with \`search_id: "${searchId}"\` to get the real URLs (free, ~30 s after the search${retryAfter ? `; Serper suggested waiting ${retryAfter} s before retrying` : ""}).`
    );
  }
  return parts.join("\n");
}
var LINK_MODES, GOTO_RE, isGotoLink;
var init_LinkResolution = __esm({
  "src/utils/LinkResolution.ts"() {
    "use strict";
    LINK_MODES = ["auto", "all", "none"];
    GOTO_RE = /^https?:\/\/(www\.)?google\.[a-z.]+\/goto\?/i;
    isGotoLink = (s) => typeof s === "string" && GOTO_RE.test(s);
  }
});

// src/utils/TtlCache.ts
var import_node_fs, import_node_path, TtlCache;
var init_TtlCache = __esm({
  "src/utils/TtlCache.ts"() {
    "use strict";
    import_node_fs = require("node:fs");
    import_node_path = require("node:path");
    TtlCache = class {
      constructor(ttlMs, maxEntries = 200, persistPath) {
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.store = /* @__PURE__ */ new Map();
        this.persistPath = persistPath;
        if (this.persistPath) {
          this.loadFromDisk();
        }
      }
      loadFromDisk() {
        if (!this.persistPath) return;
        try {
          if (!(0, import_node_fs.existsSync)(this.persistPath)) return;
          const raw = (0, import_node_fs.readFileSync)(this.persistPath, "utf-8");
          const data = JSON.parse(raw);
          const now = Date.now();
          if (Array.isArray(data)) {
            for (const [key, entry] of data) {
              if (entry && typeof entry.expiresAt === "number" && entry.expiresAt > now) {
                this.store.set(key, entry);
              }
            }
          }
        } catch {
        }
      }
      scheduleSave() {
        if (!this.persistPath || this.ttlMs <= 0) return;
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
          this.flushToDisk();
        }, 500);
        if (this.saveTimeout && typeof this.saveTimeout.unref === "function") {
          this.saveTimeout.unref();
        }
      }
      flushToDisk() {
        if (!this.persistPath) return;
        try {
          const now = Date.now();
          const validEntries = [];
          for (const [k, v] of this.store.entries()) {
            if (v && v.expiresAt > now) {
              validEntries.push([k, v]);
            }
          }
          const dir = (0, import_node_path.dirname)(this.persistPath);
          if (!(0, import_node_fs.existsSync)(dir)) {
            (0, import_node_fs.mkdirSync)(dir, { recursive: true });
          }
          (0, import_node_fs.writeFileSync)(this.persistPath, JSON.stringify(validEntries), "utf-8");
        } catch {
        }
      }
      get(key) {
        const entry = this.store.get(key);
        if (!entry) return void 0;
        if (Date.now() >= entry.expiresAt) {
          this.store.delete(key);
          this.scheduleSave();
          return void 0;
        }
        this.store.delete(key);
        this.store.set(key, entry);
        return entry.value;
      }
      set(key, value) {
        if (this.ttlMs <= 0) return;
        if (this.store.has(key)) this.store.delete(key);
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        while (this.store.size > this.maxEntries) {
          const oldest = this.store.keys().next().value;
          if (oldest === void 0) break;
          this.store.delete(oldest);
        }
        this.flushToDisk();
      }
      get size() {
        return this.store.size;
      }
      clear() {
        this.store.clear();
        this.flushToDisk();
      }
    };
  }
});

// src/utils/Metrics.ts
function increment(name, by = 1) {
  counters[name] += by;
}
function snapshot() {
  return { ...counters };
}
var counters;
var init_Metrics = __esm({
  "src/utils/Metrics.ts"() {
    "use strict";
    counters = {
      cache_hits: 0,
      cache_misses: 0,
      failover_events: 0,
      provider_errors: 0,
      searches: 0
    };
  }
});

// src/api/SerperAPI.ts
var SerperAPI_exports = {};
__export(SerperAPI_exports, {
  SerperAPI: () => SerperAPI
});
function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === void 0 || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function getPersistPath(name) {
  if (process.env.SERPER_CACHE_PERSIST === "false") return void 0;
  const dir = process.env.SERPER_CACHE_DIR || import_node_path2.default.join(import_node_os.default.homedir(), ".serper-cache");
  return import_node_path2.default.join(dir, `${name}.json`);
}
function buildSearchBody(query, options) {
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  const requestedNum = options.num_results !== void 0 && Number.isFinite(options.num_results) ? options.num_results : 10;
  const num = Math.max(1, Math.min(requestedNum, 20));
  const body = {
    q: normalizedQuery,
    num,
    gl: (options.country ?? "US").toLowerCase(),
    hl: options.search_lang ?? options.ui_lang ?? "en",
    autocorrect: options.autocorrect ?? true
  };
  if (options.freshness) body.tbs = `qdr:${options.freshness}`;
  if (options.safesearch === "strict") body.safe = "active";
  if (options.safesearch === "off") body.safe = "off";
  if (options.summary) body.summary = true;
  if (options.page && options.page > 1) body.page = options.page;
  if (options.link_resolution === "none") body.resolveLinks = false;
  return body;
}
var import_node_os, import_node_path2, ENDPOINT_MAP, SCRAPE_ENDPOINT, RESOLVE_ENDPOINT, RESOLVE_TIMEOUT_MS, LOCAL_FIELDS, SerperAPI;
var init_SerperAPI = __esm({
  "src/api/SerperAPI.ts"() {
    "use strict";
    import_node_os = __toESM(require("node:os"));
    import_node_path2 = __toESM(require("node:path"));
    init_HttpRetry();
    init_LinkResolution();
    init_TtlCache();
    init_Logger();
    init_Metrics();
    ENDPOINT_MAP = {
      web: "https://google.serper.dev/search",
      images: "https://google.serper.dev/images",
      videos: "https://google.serper.dev/videos",
      news: "https://google.serper.dev/news",
      shopping: "https://google.serper.dev/shopping",
      places: "https://google.serper.dev/places",
      scholar: "https://google.serper.dev/scholar",
      patents: "https://google.serper.dev/patents",
      autocomplete: "https://google.serper.dev/autocomplete"
    };
    SCRAPE_ENDPOINT = "https://scrape.serper.dev";
    RESOLVE_ENDPOINT = "https://google.serper.dev/resolve";
    RESOLVE_TIMEOUT_MS = 12e4;
    LOCAL_FIELDS = ["retryAfter", "credits", "provider", "cache_hit"];
    SerperAPI = class {
      constructor(apiKey, options = {}) {
        this.apiKey = apiKey;
        this.timeoutMs = options.timeoutMs ?? numberFromEnv("SERPER_TIMEOUT_MS", 3e4);
        this.retries = options.retries ?? numberFromEnv("SERPER_RETRIES", 2);
        this.baseDelayMs = options.baseDelayMs ?? numberFromEnv("SERPER_RETRY_BASE_MS", 500);
        const cacheTtlMs = options.cacheTtlMs ?? numberFromEnv("SERPER_CACHE_TTL_MS", 6e5);
        const cacheMax = options.cacheMaxEntries ?? numberFromEnv("SERPER_CACHE_MAX", 200);
        const persistPath = getPersistPath("search-cache");
        const scrapePersistPath = getPersistPath("scrape-cache");
        this.cache = cacheTtlMs > 0 ? new TtlCache(cacheTtlMs, cacheMax, persistPath) : null;
        this.scrapeCache = cacheTtlMs > 0 ? new TtlCache(cacheTtlMs, cacheMax, scrapePersistPath) : null;
      }
      async search(query, searchType = "web", options = {}) {
        const url = ENDPOINT_MAP[searchType] ?? ENDPOINT_MAP.web;
        const body = buildSearchBody(query, options);
        const cacheQuery = body.q.toLowerCase();
        const cacheKey = `${searchType}:${JSON.stringify({ ...body, q: cacheQuery })}`;
        increment("searches");
        const cached = this.cache?.get(cacheKey);
        if (cached) {
          increment("cache_hits");
          logger.debug(`SerperAPI: cache hit (${searchType})`);
          return { ...cached, cache_hit: true, credits: 0 };
        }
        increment("cache_misses");
        const data = await this.post(url, body);
        this.cache?.set(cacheKey, data);
        return data;
      }
      /**
       * Fetch and extract the contents of a single URL.
       * Note: this endpoint lives on scrape.serper.dev, not google.serper.dev.
       */
      async scrape(url, options = {}) {
        const normalizedUrl = url.trim();
        const body = {
          url: normalizedUrl,
          includeMarkdown: options.includeMarkdown ?? true,
          includeImages: options.includeImages ?? false,
          includeLinks: options.includeLinks ?? false,
          includeVideos: options.includeVideos ?? false
        };
        const cacheKey = `scrape:${normalizedUrl.toLowerCase()}:${JSON.stringify(body)}`;
        const cached = this.scrapeCache?.get(cacheKey);
        if (cached) {
          logger.debug("SerperAPI: cache hit (scrape)");
          return { ...cached, cache_hit: true };
        }
        const data = await this.post(SCRAPE_ENDPOINT, body);
        this.scrapeCache?.set(cacheKey, data);
        return data;
      }
      /**
       * POST `payload` (a search response or {links:[...]}) to /resolve. If links
       * remain unresolved, wait Serper's `retryAfter` and re-send the partial
       * result, but only while the wait plus another request still fits in
       * `maxWaitS` (Serper has been seen to suggest 90 s, so with the 60 s default
       * this is usually a single call).
       * Throws on HTTP errors or a reply whose result arrays went missing.
       */
      async resolve(payload, maxWaitS = defaultResolveMaxWaitS()) {
        const deadline = Date.now() + maxWaitS * 1e3;
        let current2 = payload;
        for (let attempts = 1; ; attempts++) {
          const body = Object.fromEntries(Object.entries(current2).filter(([k]) => !LOCAL_FIELDS.includes(k)));
          const started = Date.now();
          const out = await this.post(RESOLVE_ENDPOINT, body, {
            timeoutMs: Math.max(this.timeoutMs, RESOLVE_TIMEOUT_MS),
            errorPrefix: "Serper /resolve error"
          });
          checkResolveShape(body, out);
          const requestMs = Date.now() - started;
          const unresolved = countGotoLinks(out);
          const retryAfter = typeof out.retryAfter === "number" ? out.retryAfter : null;
          if (!unresolved || retryAfter === null || Date.now() + retryAfter * 1e3 + requestMs > deadline) {
            return { data: out, unresolved, retryAfter: unresolved ? retryAfter : null, attempts };
          }
          await new Promise((r) => setTimeout(r, retryAfter * 1e3));
          current2 = out;
        }
      }
      async post(url, body, overrides = {}) {
        const response = await fetchWithRetry(
          url,
          {
            method: "POST",
            headers: {
              "X-API-KEY": this.apiKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          },
          {
            timeoutMs: overrides.timeoutMs ?? this.timeoutMs,
            retries: this.retries,
            baseDelayMs: this.baseDelayMs,
            errorPrefix: overrides.errorPrefix ?? "Serper API error"
          }
        );
        return response.json();
      }
    };
  }
});

// src/utils/errors.ts
var ValidationError, AuthError, ProviderError;
var init_errors = __esm({
  "src/utils/errors.ts"() {
    "use strict";
    ValidationError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "ValidationError";
      }
    };
    AuthError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "AuthError";
      }
    };
    ProviderError = class extends Error {
      constructor(message, options = {}) {
        super(message);
        this.name = "ProviderError";
        this.provider = options.provider;
        this.status = options.status;
        this.cause = options.cause;
      }
    };
  }
});

// src/api/providers/Provider.ts
function providerOrderFromEnv() {
  const raw = (process.env.SEARCH_PROVIDER_ORDER ?? "serper,tavily,brave").toLowerCase();
  const valid = ["serper", "tavily", "brave", "exa", "firecrawl"];
  const list = raw.split(",").map((s) => s.trim()).filter((s) => valid.includes(s));
  return list.length ? list : ["serper"];
}
function isFallbackEnabled() {
  const raw = (process.env.SEARCH_FALLBACK ?? "true").toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "no";
}
var init_Provider = __esm({
  "src/api/providers/Provider.ts"() {
    "use strict";
  }
});

// src/api/providers/TavilyProvider.ts
var TavilyProvider;
var init_TavilyProvider = __esm({
  "src/api/providers/TavilyProvider.ts"() {
    "use strict";
    init_HttpRetry();
    TavilyProvider = class {
      constructor() {
        this.name = "tavily";
      }
      isConfigured() {
        return Boolean(process.env.TAVILY_API_KEY);
      }
      async search(query, type, opts) {
        const apiKey = process.env.TAVILY_API_KEY ?? "";
        const res = await fetchWithRetry(
          "https://api.tavily.com/search",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              query,
              max_results: Math.min(opts.num_results ?? 10, 20),
              search_depth: "advanced",
              include_answer: type === "web",
              include_domains: []
            })
          },
          { timeoutMs: 3e4, retries: 1, errorPrefix: "Tavily error" }
        );
        const data = await res.json();
        return {
          searchParameters: { q: query, type },
          answerBox: data.answer ? { snippet: data.answer } : void 0,
          organic: (data.results ?? []).map((r, i) => ({
            title: r.title,
            link: r.url,
            snippet: r.content,
            position: i + 1,
            date: r.published_date
          })),
          provider: "tavily"
        };
      }
    };
  }
});

// src/api/providers/BraveProvider.ts
var BraveProvider;
var init_BraveProvider = __esm({
  "src/api/providers/BraveProvider.ts"() {
    "use strict";
    init_HttpRetry();
    BraveProvider = class {
      constructor() {
        this.name = "brave";
      }
      isConfigured() {
        return Boolean(process.env.BRAVE_API_KEY);
      }
      async search(query, type, opts) {
        const apiKey = process.env.BRAVE_API_KEY ?? "";
        const params = new URLSearchParams({
          q: query,
          count: String(Math.min(opts.num_results ?? 10, 20))
        });
        const res = await fetchWithRetry(
          `https://api.search.brave.com/res/v1/web/search?${params}`,
          { headers: { "X-Subscription-Token": apiKey, Accept: "application/json" } },
          { timeoutMs: 3e4, retries: 1, errorPrefix: "Brave error" }
        );
        const data = await res.json();
        return {
          searchParameters: { q: query, type },
          organic: (data.web?.results ?? []).map((r, i) => ({
            title: r.title,
            link: r.url,
            snippet: r.description,
            position: i + 1
          })),
          provider: "brave"
        };
      }
    };
  }
});

// src/api/providers/ExaProvider.ts
var ExaProvider;
var init_ExaProvider = __esm({
  "src/api/providers/ExaProvider.ts"() {
    "use strict";
    init_HttpRetry();
    ExaProvider = class {
      constructor() {
        this.name = "exa";
      }
      isConfigured() {
        return Boolean(process.env.EXA_API_KEY);
      }
      async search(query, type, opts) {
        const apiKey = process.env.EXA_API_KEY ?? "";
        const res = await fetchWithRetry(
          "https://api.exa.ai/search",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              query,
              numResults: Math.min(opts.num_results ?? 10, 20),
              livecrawl: "preferred"
            })
          },
          { timeoutMs: 3e4, retries: 1, errorPrefix: "Exa error" }
        );
        const data = await res.json();
        return {
          searchParameters: { q: query, type },
          organic: (data.results ?? []).map((r, i) => ({
            title: r.title,
            link: r.url,
            snippet: (r.highlights?.[0] ?? r.text ?? "").slice(0, 500),
            position: i + 1,
            date: r.publishedDate
          })),
          provider: "exa"
        };
      }
    };
  }
});

// src/api/providers/FirecrawlProvider.ts
var FirecrawlProvider;
var init_FirecrawlProvider = __esm({
  "src/api/providers/FirecrawlProvider.ts"() {
    "use strict";
    init_HttpRetry();
    FirecrawlProvider = class {
      constructor() {
        this.name = "firecrawl";
      }
      isConfigured() {
        return Boolean(process.env.FIRECRAWL_API_KEY);
      }
      async search(query, type, opts) {
        const apiKey = process.env.FIRECRAWL_API_KEY ?? "";
        const res = await fetchWithRetry(
          "https://api.firecrawl.dev/v2/search",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query, limit: Math.min(opts.num_results ?? 10, 20) })
          },
          { timeoutMs: 3e4, retries: 1, errorPrefix: "Firecrawl error" }
        );
        const data = await res.json();
        return {
          searchParameters: { q: query, type },
          organic: (data.data ?? []).map((r, i) => ({
            title: r.title,
            link: r.url,
            snippet: r.markdown?.slice(0, 500) ?? r.description ?? "",
            position: i + 1
          })),
          provider: "firecrawl"
        };
      }
      async scrape(url) {
        const apiKey = process.env.FIRECRAWL_API_KEY ?? "";
        const res = await fetchWithRetry(
          "https://api.firecrawl.dev/v2/scrape",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ url, formats: ["markdown"] })
          },
          { timeoutMs: 6e4, retries: 1, errorPrefix: "Firecrawl scrape error" }
        );
        return res.json();
      }
    };
  }
});

// src/api/providers/Router.ts
var Router_exports = {};
__export(Router_exports, {
  ProviderRouter: () => ProviderRouter
});
function serperAdapter(api) {
  return {
    name: "serper",
    isConfigured: () => true,
    search: (q, t, o) => api.search(q, t, o),
    scrape: (url) => api.scrape(url)
  };
}
function isFailoverError(err, data) {
  if (data && !(data.organic?.length || data.images?.length || data.places?.length || data.news?.length)) {
    return true;
  }
  if (err instanceof ProviderError) {
    if (err.status === 402 || err.status === 429 || err.status !== void 0 && err.status >= 500) return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return FAILOVER_PATTERNS.some((re) => re.test(msg));
}
function fuseRRF(lists, k = 60) {
  const scores = /* @__PURE__ */ new Map();
  for (const list of lists) {
    const organic = list[0]?.organic ?? [];
    organic.forEach((item, rank) => {
      const key = item.link || item.title;
      const prev = scores.get(key);
      const score = (prev?.score ?? 0) + 1 / (k + rank + 1);
      scores.set(key, { score, item });
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).map((s) => s.item);
}
var FAILOVER_PATTERNS, ProviderRouter;
var init_Router = __esm({
  "src/api/providers/Router.ts"() {
    "use strict";
    init_Logger();
    init_errors();
    init_Metrics();
    init_Provider();
    init_TavilyProvider();
    init_BraveProvider();
    init_ExaProvider();
    init_FirecrawlProvider();
    FAILOVER_PATTERNS = [/402/, /429/, /5\d\d/, /payment/i, /quota/i, /rate limit/i, /empty/i];
    ProviderRouter = class {
      constructor(api) {
        this.providers = [
          serperAdapter(api),
          new TavilyProvider(),
          new BraveProvider(),
          new ExaProvider(),
          new FirecrawlProvider()
        ];
      }
      providerNames() {
        return this.providers.filter((p) => p.isConfigured()).map((p) => p.name);
      }
      async search(query, type, opts) {
        const requested = (opts.provider ?? "auto").toLowerCase();
        const order = providerOrderFromEnv();
        const fallback = isFallbackEnabled();
        if (requested === "all") {
          const active = this.providers.filter((p) => p.isConfigured());
          const settled = await Promise.allSettled(active.map((p) => p.search(query, type, opts)));
          const ok = [];
          for (const [i, s] of settled.entries()) {
            if (s.status === "fulfilled") {
              ok.push([s.value]);
            } else {
              increment("provider_errors");
              logger.warn(`Provider ${active[i]?.name} failed in fan-out (${s.reason instanceof Error ? s.reason.message : s.reason}) \u2014 excluded from fusion`);
            }
          }
          const fused = fuseRRF(ok);
          return {
            searchParameters: { q: query, type },
            organic: fused,
            provider: "all"
          };
        }
        if (requested !== "auto") {
          const pinned = this.providers.find((p) => p.name === requested);
          if (!pinned) throw new ValidationError(`Unknown provider: ${requested}`);
          try {
            const data = await pinned.search(query, type, opts);
            return { ...data, provider: pinned.name };
          } catch (err) {
            increment("provider_errors");
            if (err instanceof ProviderError) throw err;
            throw new ProviderError(err instanceof Error ? err.message : String(err), { provider: pinned.name, cause: err });
          }
        }
        const chain = order.map((n) => this.providers.find((p) => p.name === n)).filter((p) => Boolean(p && p.isConfigured()));
        let lastError = null;
        for (const provider of chain) {
          try {
            const data = await provider.search(query, type, opts);
            if (!fallback) return { ...data, provider: provider.name };
            if (isFailoverError(null, data) && chain.length > 1) {
              logger.warn(`Provider ${provider.name} returned empty \u2014 failing over\u2026`);
              increment("failover_events");
              lastError = new ProviderError(`${provider.name} returned empty results`, { provider: provider.name });
              continue;
            }
            return { ...data, provider: provider.name };
          } catch (err) {
            lastError = err;
            increment("provider_errors");
            if (!fallback || provider === chain[chain.length - 1]) {
              if (err instanceof ProviderError) throw err;
              throw new ProviderError(err instanceof Error ? err.message : String(err), { provider: provider.name, cause: err });
            }
            increment("failover_events");
            logger.warn(`Provider ${provider.name} failed (${err instanceof Error ? err.message : err}) \u2014 failing over\u2026`);
          }
        }
        throw lastError instanceof Error ? lastError : new ProviderError("All search providers failed", { provider: "auto" });
      }
    };
  }
});

// src/utils/ResultFormatter.ts
var ResultFormatter_exports = {};
__export(ResultFormatter_exports, {
  ResultFormatter: () => ResultFormatter,
  effectiveFetchCount: () => effectiveFetchCount
});
function resolveVerbosity(requested, searchType) {
  if (requested && requested !== "auto") return requested;
  if (searchType === "places" || searchType === "shopping" || searchType === "images") return "full";
  if (searchType === "scholar" || searchType === "patents") return "full";
  return "standard";
}
function effectiveFetchCount(requested, verbosity, searchType) {
  const def = searchType === "places" ? 5 : 10;
  if (requested !== void 0) return Math.max(1, Math.min(requested, 20));
  if (verbosity === "compact") return Math.min(5, def);
  return def;
}
var ResultFormatter;
var init_ResultFormatter = __esm({
  "src/utils/ResultFormatter.ts"() {
    "use strict";
    ResultFormatter = class {
      static format(data, maxResults, searchType, opts = {}) {
        const verbosity = resolveVerbosity(opts.verbosity, searchType);
        const q = data.searchParameters?.q ?? "";
        const label = this.label(searchType);
        const parts = [`## ${label} Results${q ? ` \u2014 "${q}"` : ""}
`];
        const showRich = verbosity === "standard" || verbosity === "full";
        if (searchType === "web" && showRich && data.answerBox) {
          const ab = data.answerBox;
          parts.push("### \u{1F3AF} Answer Box\n");
          if (ab.title) parts.push(`**${ab.title}**
`);
          if (ab.snippet) parts.push(`${ab.snippet}
`);
          if (ab.link) parts.push(`[Source](${ab.link})
`);
          parts.push("");
        }
        if (searchType === "web" && showRich && data.knowledgeGraph) {
          const kg = data.knowledgeGraph;
          parts.push("### \u{1F9E0} Knowledge Graph\n");
          if (kg.title) parts.push(`**${kg.title}**${kg.type ? ` \xB7 ${kg.type}` : ""}
`);
          if (kg.description) parts.push(`${kg.description}
`);
          if (kg.website) parts.push(`[Website](${kg.website})
`);
          if (kg.rating) parts.push(`\u2B50 ${kg.rating}${kg.reviewsCount ? ` (${kg.reviewsCount.toLocaleString()} reviews)` : ""}
`);
          if (kg.attributes) {
            for (const [k, v] of Object.entries(kg.attributes)) {
              parts.push(`- **${k}:** ${v}`);
            }
            parts.push("");
          }
          parts.push("");
        }
        switch (searchType) {
          case "web":
            parts.push(...this.formatOrganic(data.organic ?? [], maxResults, verbosity, opts));
            break;
          case "images":
            parts.push(...this.formatImages(data.images ?? [], maxResults, opts));
            break;
          case "videos":
            parts.push(...this.formatVideos(data.videos ?? [], maxResults));
            break;
          case "news":
            parts.push(...this.formatNews(data.news ?? [], maxResults, verbosity));
            break;
          case "shopping":
            parts.push(...this.formatShopping(data.shopping ?? [], maxResults));
            break;
          case "places":
            parts.push(...this.formatPlaces(data.places ?? [], maxResults, {}));
            break;
          case "scholar":
            parts.push(...this.formatScholar(data.organic ?? [], maxResults));
            break;
          case "patents":
            parts.push(...this.formatPatents(data.patents ?? data.organic ?? [], maxResults));
            break;
          case "autocomplete":
            parts.push(...this.formatAutocomplete(data.suggestions ?? [], maxResults));
            break;
        }
        if (searchType === "web" && showRich && data.peopleAlsoAsk?.length) {
          parts.push("\n### \u{1F4AC} People Also Ask\n");
          for (const paa of data.peopleAlsoAsk.slice(0, 4)) {
            parts.push(`**Q: ${paa.question}**`);
            parts.push(`${paa.snippet}`);
            parts.push(`[Read more](${paa.link})
`);
          }
        }
        if (searchType === "web" && showRich && data.relatedSearches?.length) {
          const rs = data.relatedSearches.slice(0, 6).map((r) => r.query);
          parts.push("\n### \u{1F517} Related Searches\n");
          parts.push(rs.map((r) => `- ${r}`).join("\n"));
        }
        const footer = [];
        if (data.credits !== void 0) footer.push(`Serper credits used: ${data.credits}`);
        const provider = data.provider ?? "serper";
        const cacheHit = data.cache_hit === true;
        if (verbosity === "compact") {
          footer.push("Tokens: ~800 (compact) \xB7 upgrade with verbosity=full");
        }
        parts.push(`

---
*${[`Provider: ${provider}`, `Cache: ${cacheHit ? "hit (0 credits)" : "miss"}`, ...footer].join(" \xB7 ")}*`);
        let text = parts.join("\n");
        if (opts.maxChars && opts.maxChars > 0 && text.length > opts.maxChars) {
          text = text.slice(0, opts.maxChars) + `

\u2026[truncated to ${opts.maxChars.toLocaleString()} chars]`;
        }
        return text;
      }
      // ── Per-type formatters ──────────────────────────────────────────────────
      static formatOrganic(results, max, verbosity, opts) {
        if (!results.length) return ["*No organic results found.*"];
        const out = ["### \u{1F310} Organic Results\n"];
        if (verbosity === "compact" || opts.snippetsOnly) {
          for (const [i, r] of results.slice(0, max).entries()) {
            const snippet = (r.snippet ?? "").split("\n")[0].slice(0, 160);
            out.push(`${i + 1}. [${r.title}](${r.link}) \u2014 ${snippet}`);
          }
          return out;
        }
        for (const [i, r] of results.slice(0, max).entries()) {
          out.push(`#### ${i + 1}. [${r.title}](${r.link})`);
          if (r.date) out.push(`*${r.date}*`);
          if (r.snippet) out.push(r.snippet);
          if (r.sitelinks?.length) {
            out.push("**Sitelinks:** " + r.sitelinks.map((s) => `[${s.title}](${s.link})`).join(" \xB7 "));
          }
          out.push("");
        }
        if (results.length > max) out.push(`*Showing ${max} of ${results.length} results.*`);
        return out;
      }
      static formatImages(results, max, opts = {}) {
        if (!results.length) return ["*No image results found.*"];
        if (opts.layout === "gallery") {
          const out2 = ["### \u{1F5BC}\uFE0F Image Results (gallery)\n"];
          out2.push("| " + results.slice(0, max).map((r, i) => `![${r.title.slice(0, 30)}](${r.thumbnailUrl ?? r.imageUrl})`).join(" | ") + " |");
          out2.push("| " + results.slice(0, max).map(() => "---").join(" | ") + " |");
          out2.push("| " + results.slice(0, max).map((r) => {
            const dims = r.imageWidth && r.imageHeight ? `${r.imageWidth}\xD7${r.imageHeight} \xB7 ` : "";
            const src = r.source ?? r.domain ?? "";
            return `${dims}${src} \xB7 [Full](${r.imageUrl})`;
          }).join(" | ") + " |");
          void opts;
          return out2;
        }
        const out = ["### \u{1F5BC}\uFE0F Image Results\n"];
        for (const [i, r] of results.slice(0, max).entries()) {
          out.push(`#### ${i + 1}. ${r.title}`);
          if (r.thumbnailUrl) out.push(`![${r.title.slice(0, 60)}](${r.thumbnailUrl})`);
          out.push(`- **Image URL:** ${r.imageUrl}`);
          if (r.imageWidth && r.imageHeight) out.push(`- **Dimensions:** ${r.imageWidth}\xD7${r.imageHeight}`);
          if (r.source) out.push(`- **Source:** ${r.source}`);
          if (r.domain) out.push(`- **Domain:** ${r.domain}`);
          if (r.link) out.push(`- **Source Page:** ${r.link}`);
          out.push("");
        }
        return out;
      }
      static formatVideos(results, max) {
        if (!results.length) return ["*No video results found.*"];
        const out = ["### \u{1F3AC} Video Results\n"];
        for (const [i, r] of results.slice(0, max).entries()) {
          const title = r.link ? `[${r.title}](${r.link})` : r.title;
          out.push(`#### ${i + 1}. ${title}`);
          if (r.channel) out.push(`- **Channel:** ${r.channel}`);
          if (r.duration) out.push(`- **Duration:** ${r.duration}`);
          if (r.date) out.push(`- **Date:** ${r.date}`);
          if (r.snippet) out.push(`- **Description:** ${r.snippet}`);
          out.push("");
        }
        return out;
      }
      static formatNews(results, max, verbosity) {
        if (!results.length) return ["*No news results found.*"];
        const out = ["### \u{1F4F0} News Results\n"];
        if (verbosity === "compact") {
          for (const [i, r] of results.slice(0, max).entries()) {
            out.push(`${i + 1}. [${r.title}](${r.link}) \u2014 ${r.source ?? ""} ${r.date ?? ""}`.trim());
          }
          return out;
        }
        for (const [i, r] of results.slice(0, max).entries()) {
          out.push(`#### ${i + 1}. [${r.title}](${r.link})`);
          const meta = [];
          if (r.source) meta.push(r.source);
          if (r.date) meta.push(r.date);
          if (meta.length) out.push(`*${meta.join(" \xB7 ")}*`);
          if (r.snippet) out.push(r.snippet);
          out.push("");
        }
        return out;
      }
      static formatShopping(results, max) {
        if (!results.length) return ["*No shopping results found.*"];
        const out = ["### \u{1F6D2} Shopping Results\n"];
        for (const [i, r] of results.slice(0, max).entries()) {
          const title = r.link ? `[${r.title}](${r.link})` : r.title;
          out.push(`#### ${i + 1}. ${title}`);
          if (r.price) out.push(`- **Price:** ${r.price}`);
          if (r.source) out.push(`- **Seller:** ${r.source}`);
          if (r.rating) {
            const stars = "\u2B50".repeat(Math.round(r.rating));
            out.push(`- **Rating:** ${stars} ${r.rating}${r.ratingCount ? ` (${r.ratingCount.toLocaleString()})` : ""}`);
          }
          if (r.delivery) out.push(`- **Delivery:** ${r.delivery}`);
          if (r.offers) out.push(`- **Offers:** ${r.offers}`);
          out.push("");
        }
        return out;
      }
      static formatPlaces(results, max, filters = {}) {
        if (!results.length) return ["*No place results found.*"];
        let list = [...results];
        if (filters.minRating !== void 0) list = list.filter((r) => (r.rating ?? 0) >= filters.minRating);
        if (filters.sortBy === "rating") list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        if (filters.sortBy === "reviews") list.sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0));
        const out = ["### \u{1F4CD} Place Results\n"];
        for (const [i, r] of list.slice(0, max).entries()) {
          out.push(`#### ${i + 1}. ${r.title}${r.category ? ` *${r.category}*` : ""}`);
          if (r.address) out.push(`- **Address:** ${r.address}`);
          if (r.phoneNumber) out.push(`- **Phone:** ${r.phoneNumber}`);
          if (r.website) out.push(`- **Website:** [${r.website}](${r.website})`);
          if (r.rating) {
            const stars = "\u2B50".repeat(Math.round(r.rating));
            out.push(`- **Rating:** ${stars} ${r.rating}${r.ratingCount ? ` (${r.ratingCount.toLocaleString()} reviews)` : ""}`);
          }
          if (r.openingHours?.length) {
            out.push(`- **Hours:**`);
            for (const h of r.openingHours) out.push(`  - ${h}`);
          }
          if (r.latitude !== void 0 && r.longitude !== void 0) {
            out.push(`- **Maps:** [View on Google Maps](https://www.google.com/maps?q=${r.latitude},${r.longitude}) | [Directions](https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude})`);
          } else if (r.address) {
            const q = encodeURIComponent(`${r.title} ${r.address}`);
            out.push(`- **Maps:** [Search on Google Maps](https://www.google.com/maps/search/?api=1&query=${q})`);
          }
          const pid = r.placeId ?? r.cid;
          if (pid) out.push(`- **Place ID:** ${pid}`);
          out.push("");
        }
        return out;
      }
      static formatScholar(results, max) {
        if (!results.length) return ["*No scholar results found.*"];
        const out = ["### \u{1F393} Publications\n"];
        for (const [i, r] of results.slice(0, max).entries()) {
          out.push(`#### ${i + 1}. [${r.title}](${r.link})`);
          const meta = [];
          if (r.publicationInfo) meta.push(r.publicationInfo);
          else if (r.year) meta.push(String(r.year));
          if (r.citedBy !== void 0) meta.push(`cited by ${r.citedBy}`);
          if (meta.length) out.push(`*${meta.join(" \xB7 ")}*`);
          if (r.snippet) out.push(r.snippet);
          out.push("");
        }
        if (results.length > max) out.push(`*Showing ${max} of ${results.length} results.*`);
        return out;
      }
      static formatPatents(results, max) {
        if (!results.length) return ["*No patent results found.*"];
        const out = ["### \u{1F4DC} Patent Results\n"];
        for (const [i, r] of results.slice(0, max).entries()) {
          const p = r;
          const title = p.link ? `[${p.title}](${p.link})` : p.title;
          out.push(`#### ${i + 1}. ${title}`);
          const meta = [];
          if (p.publicationNumber) meta.push(p.publicationNumber);
          if (p.assignee) meta.push(p.assignee);
          if (p.inventor) meta.push(`Inventor: ${p.inventor}`);
          if (p.publicationDate ?? p.date) meta.push(String(p.publicationDate ?? p.date));
          if (meta.length) out.push(`*${meta.join(" \xB7 ")}*`);
          if (p.snippet) out.push(p.snippet);
          out.push("");
        }
        return out;
      }
      static formatAutocomplete(suggestions, max) {
        if (!suggestions.length) return ["*No suggestions found.*"];
        const out = ["### \u2328\uFE0F Autocomplete Suggestions\n"];
        for (const [i, s] of suggestions.slice(0, max).entries()) {
          out.push(`${i + 1}. ${typeof s === "string" ? s : s.suggestion}`);
        }
        return out;
      }
      // ── Scrape formatter ─────────────────────────────────────────────────────
      /**
       * Format a scrape response. Prefers `markdown`, falls back to `text`,
       * then to a raw JSON dump. Truncates to maxChars for context safety.
       */
      static formatScrape(data, url, maxChars = 5e4) {
        const markdown = typeof data["markdown"] === "string" ? data["markdown"] : "";
        const text = typeof data["text"] === "string" ? data["text"] : "";
        const raw = markdown || text;
        const parts = ["## \u{1F4C4} Scraped Page\n", `**URL:** ${url}
`];
        if (!raw) {
          const json = JSON.stringify(data, null, 2);
          parts.push(
            "*No markdown/text content returned. Raw response (truncated):*\n",
            "```json",
            json.slice(0, maxChars),
            "```"
          );
          return parts.join("\n");
        }
        const truncated = raw.length > maxChars;
        parts.push(truncated ? raw.slice(0, maxChars) : raw);
        if (truncated) {
          parts.push(
            `

---
*Truncated to ${maxChars.toLocaleString()} of ${raw.length.toLocaleString()} characters.*`
          );
        }
        if (typeof data["credits"] === "number") {
          parts.push(`
*Serper credits used: ${data["credits"]}*`);
        }
        return parts.join("\n");
      }
      // ── Helpers ──────────────────────────────────────────────────────────────
      static label(type) {
        const labels = {
          web: "\u{1F310} Web Search",
          images: "\u{1F5BC}\uFE0F Image Search",
          videos: "\u{1F3AC} Video Search",
          news: "\u{1F4F0} News Search",
          shopping: "\u{1F6D2} Shopping Search",
          places: "\u{1F4CD} Places Search",
          scholar: "\u{1F393} Scholar Search",
          patents: "\u{1F4DC} Patent Search",
          autocomplete: "\u2328\uFE0F Autocomplete"
        };
        return labels[type] ?? type;
      }
    };
  }
});

// src/api/LLMClient.ts
function numberFromEnv2(name, fallback) {
  const raw = process.env[name];
  if (raw === void 0 || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function getLLMTimeoutMs() {
  return numberFromEnv2("SERPER_LLM_TIMEOUT_MS", 12e4);
}
function getLLMRetries() {
  return Math.max(0, numberFromEnv2("SERPER_LLM_RETRIES", 2));
}
function detectProvider() {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || "google/gemini-3.1-flash-lite:free"
    };
  }
  if (process.env.GEMINI_API_KEY) {
    return {
      provider: "gemini",
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite"
    };
  }
  return null;
}
async function callOpenRouter(config, prompt) {
  const res = await fetchWithRetry(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/smjahid012/serper-search-mcp-server",
        "X-Title": "Serper Search MCP"
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4096
      })
    },
    { timeoutMs: getLLMTimeoutMs(), retries: getLLMRetries(), errorPrefix: "OpenRouter error" }
  );
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
async function callGemini(config, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096 }
      })
    },
    { timeoutMs: getLLMTimeoutMs(), retries: getLLMRetries(), errorPrefix: "Gemini error" }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
async function callLLM(prompt) {
  const config = detectProvider();
  if (!config) {
    throw new Error(
      "No LLM API key found. Set OPENROUTER_API_KEY or GEMINI_API_KEY in your environment."
    );
  }
  let content;
  if (config.provider === "openrouter") {
    content = await callOpenRouter(config, prompt);
  } else {
    content = await callGemini(config, prompt);
  }
  return { content, provider: config.provider, model: config.model };
}
function getLLMProvider() {
  return detectProvider();
}
var init_LLMClient = __esm({
  "src/api/LLMClient.ts"() {
    "use strict";
    init_HttpRetry();
  }
});

// src/utils/Concurrency.ts
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (; ; ) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index];
      results[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}
var RESEARCH_CONCURRENCY;
var init_Concurrency = __esm({
  "src/utils/Concurrency.ts"() {
    "use strict";
    RESEARCH_CONCURRENCY = 4;
  }
});

// src/tools/DeepResearch.ts
var DeepResearch_exports = {};
__export(DeepResearch_exports, {
  deepResearchLinkFooter: () => deepResearchLinkFooter,
  runDeepResearch: () => runDeepResearch
});
async function generateSubQueries(query, count) {
  const prompt = `You are a research assistant. Break the following research question into ${count} focused, specific search queries that together cover the topic comprehensively.

Research question: "${query}"

Return ONLY a JSON array of strings, no explanation, no markdown, no code fences. Example: ["query one","query two","query three"]`;
  const { content } = await callLLM(prompt);
  try {
    const clean = content.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.every((q) => typeof q === "string")) {
      return parsed.slice(0, count);
    }
  } catch {
    const matches = content.match(/"([^"]+)"/g);
    if (matches) return matches.slice(0, count).map((m) => m.replace(/"/g, ""));
  }
  return [query, `${query} overview`, `${query} latest research`].slice(0, count);
}
async function runSearches(subQueries, resultsPerQuery, api, country) {
  const searches = subQueries.map((sq) => async () => {
    try {
      const data = await api.search(sq, "web", { num_results: resultsPerQuery, country });
      let results = (data.organic ?? []).slice(0, resultsPerQuery);
      let resolveError;
      if (countGotoLinks(results)) {
        try {
          const r = await api.resolve({ links: results.map((x) => x.link) });
          const links = r.data["links"];
          results = results.map((x, i) => typeof links[i] === "string" ? { ...x, link: links[i] } : x);
        } catch (err) {
          resolveError = err instanceof Error ? err.message : String(err);
        }
      }
      return { subQuery: sq, results, resolveError };
    } catch {
      return { subQuery: sq, results: [] };
    }
  });
  return mapWithConcurrency(searches, RESEARCH_CONCURRENCY, (fn) => fn());
}
function buildContext(searchResults) {
  const sections = [];
  const gotoSources = [];
  let sourceCount = 0;
  for (const { subQuery, results } of searchResults) {
    if (!results.length) continue;
    sections.push(`### Sub-query: "${subQuery}"
`);
    for (const r of results) {
      sourceCount++;
      if (isGotoLink(r.link)) gotoSources.push({ n: sourceCount, link: r.link });
      sections.push(`**[${sourceCount}] ${r.title}**`);
      sections.push(`URL: ${r.link}`);
      if (r.snippet) sections.push(`Snippet: ${r.snippet}`);
      if (r.date) sections.push(`Date: ${r.date}`);
      sections.push("");
    }
  }
  let context = sections.join("\n");
  let truncated = false;
  if (context.length > MAX_RESEARCH_CONTEXT_CHARS) {
    context = context.slice(0, MAX_RESEARCH_CONTEXT_CHARS) + "\n\n\u2026[context truncated to 12k chars]";
    truncated = true;
  }
  return { context, sourceCount, truncated, gotoSources };
}
async function synthesizeReport(query, context, depth) {
  const depthInstructions = {
    basic: "Write a concise summary (3\u20134 paragraphs).",
    standard: "Write a comprehensive analysis (5\u20137 paragraphs) with clear sections.",
    deep: "Write an exhaustive research report with an executive summary, detailed sections, key findings, and conclusions."
  };
  const prompt = `You are an expert research analyst. Using ONLY the search results provided below, answer the research question with a well-structured report. Cite sources using their reference numbers [1], [2], etc. Do not invent facts not present in the sources.

Research question: "${query}"

${depthInstructions[depth]}

Always end with a "## Sources" section listing all cited references with their URLs.

--- SEARCH RESULTS ---
${context}
--- END OF SEARCH RESULTS ---

Write the research report now:`;
  const { content, provider, model } = await callLLM(prompt);
  return { report: content, provider, model };
}
async function runDeepResearch(query, depth = "standard", country = "US", api) {
  const llmConfig = getLLMProvider();
  if (!llmConfig) {
    throw new Error(
      "Deep research requires an LLM API key.\nSet OPENROUTER_API_KEY (free models available at openrouter.ai)\nor GEMINI_API_KEY (free at aistudio.google.com) in your environment."
    );
  }
  const { subQueries: subQueryCount, resultsPerQuery } = DEPTH_CONFIG[depth] ?? DEPTH_CONFIG.standard;
  const subQueries = await generateSubQueries(query, subQueryCount);
  const searchResults = await runSearches(subQueries, resultsPerQuery, api, country);
  const { context, sourceCount, gotoSources } = buildContext(searchResults);
  const resolveErrors = [...new Set(searchResults.map((s) => s.resolveError).filter((e) => Boolean(e)))];
  if (!sourceCount) {
    throw new Error("No search results found for this query. Try broadening your research question.");
  }
  const { report, provider, model } = await synthesizeReport(query, context, depth);
  return {
    query,
    depth,
    report,
    subQueries,
    sourceCount,
    provider,
    model,
    gotoSources,
    resolveErrors
  };
}
function deepResearchLinkFooter(result) {
  const { gotoSources, resolveErrors } = result;
  if (!gotoSources.length) return "";
  return [
    "",
    "",
    "---",
    `> \u26A0\uFE0F **${gotoSources.length} source URL(s) are still Google redirects** (\`google.com/goto?\u2026\`), not real URLs: ` + gotoSources.map((s) => `[${s.n}]`).join(", ") + ".",
    ...resolveErrors.map((e) => `> /resolve failed: ${e}`),
    "> Call `resolve_links` with these links to get the real URLs:",
    ...gotoSources.map((s) => `> - [${s.n}] ${s.link}`)
  ].join("\n");
}
var DEPTH_CONFIG, MAX_RESEARCH_CONTEXT_CHARS;
var init_DeepResearch = __esm({
  "src/tools/DeepResearch.ts"() {
    "use strict";
    init_LLMClient();
    init_Concurrency();
    init_LinkResolution();
    DEPTH_CONFIG = {
      basic: { subQueries: 3, resultsPerQuery: 3 },
      standard: { subQueries: 5, resultsPerQuery: 5 },
      deep: { subQueries: 8, resultsPerQuery: 5 }
    };
    MAX_RESEARCH_CONTEXT_CHARS = 12e3;
  }
});

// src/tools/RAGContext.ts
var RAGContext_exports = {};
__export(RAGContext_exports, {
  buildRAGContext: () => buildRAGContext
});
function cleanText(raw) {
  return raw.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*|__|~~/g, "").replace(/<[^>]+>/g, "").replace(/https?:\/\/\S+/g, "").replace(/\s{2,}/g, " ").trim();
}
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
function buildChunks(results, maxChunkWords, includeSnippet) {
  const chunks = [];
  let chunkIndex = 0;
  for (let si = 0; si < results.length; si++) {
    const r = results[si];
    if (!r.title && !r.snippet) continue;
    const parts = [];
    parts.push(cleanText(r.title));
    if (includeSnippet && r.snippet) {
      parts.push(cleanText(r.snippet));
    }
    const fullText = parts.join(" ").trim();
    if (!fullText) continue;
    const words = fullText.split(/\s+/);
    for (let start = 0; start < words.length; start += maxChunkWords) {
      const slice = words.slice(start, start + maxChunkWords).join(" ");
      chunks.push({
        chunk_index: chunkIndex++,
        source_index: si + 1,
        title: r.title,
        url: r.link,
        domain: extractDomain(r.link),
        date: r.date ?? null,
        text: slice,
        word_count: slice.split(/\s+/).length,
        char_count: slice.length
      });
    }
  }
  return chunks;
}
function paaChunks(data, startIndex) {
  if (!data.peopleAlsoAsk?.length) return [];
  return data.peopleAlsoAsk.slice(0, 4).map((paa, i) => {
    const text = `Q: ${paa.question} A: ${cleanText(paa.snippet)}`;
    return {
      chunk_index: startIndex + i,
      source_index: 0,
      // 0 = PAA, not an organic result
      title: paa.question,
      url: paa.link,
      domain: extractDomain(paa.link),
      date: null,
      text,
      word_count: text.split(/\s+/).length,
      char_count: text.length
    };
  });
}
async function buildRAGContext(query, options, api, links) {
  const {
    num_results = 10,
    country = "US",
    freshness,
    max_chunk_words = 200,
    include_paa = true,
    output_format = "json",
    link_resolution = "auto"
  } = options;
  const chunkWords = Math.min(1e3, Math.max(50, Math.floor(Number(max_chunk_words)) || 200));
  const data = await api.search(query, "web", { num_results, country, freshness, autocorrect: true, link_resolution });
  const render = (d, state) => renderRAG(query, d, chunkWords, include_paa, output_format, state);
  if (!links) return render(data, { unresolved: 0, searchId: null, retryAfter: null });
  const countShown = (d) => countGotoLinks(d.organic ?? []) + (include_paa ? countGotoLinks((d.peopleAlsoAsk ?? []).slice(0, 4).map((p) => p.link)) : 0);
  const r = await links.apply(data, { mode: link_resolution, countShown, render });
  return render(r.data, r);
}
function renderRAG(query, data, chunkWords, include_paa, output_format, state) {
  const organic = data.organic ?? [];
  const mainChunks = buildChunks(organic, chunkWords, true);
  const paa = include_paa ? paaChunks(data, mainChunks.length) : [];
  const allChunks = [...mainChunks, ...paa];
  const totalWords = allChunks.reduce((sum, c) => sum + c.word_count, 0);
  const result = {
    query,
    total_sources: organic.length,
    total_chunks: allChunks.length,
    total_words: totalWords,
    chunks: allChunks
  };
  if (state.unresolved) {
    result.unresolved_links = state.unresolved;
    result.search_id = state.searchId;
    result.note = "Some URLs are google.com/goto redirects; call resolve_links with search_id to get real URLs.";
    if (state.resolveError) result.resolve_error = state.resolveError;
  }
  if (output_format === "text") {
    const lines = [
      `# RAG Context: "${query}"`,
      `Sources: ${result.total_sources} | Chunks: ${result.total_chunks} | Words: ${result.total_words}`,
      ""
    ];
    for (const c of allChunks) {
      lines.push(`--- Chunk ${c.chunk_index + 1} | Source ${c.source_index || "PAA"} | ${c.domain}${c.date ? ` | ${c.date}` : ""} ---`);
      lines.push(`Title: ${c.title}`);
      lines.push(`URL: ${c.url}`);
      lines.push(c.text);
      lines.push("");
    }
    return lines.join("\n") + unresolvedNote(state);
  }
  return JSON.stringify(result, null, 2);
}
var init_RAGContext = __esm({
  "src/tools/RAGContext.ts"() {
    "use strict";
    init_LinkResolution();
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  SerperMCPServer: () => SerperMCPServer
});
module.exports = __toCommonJS(index_exports);

// src/server/SerperMCPServer.ts
var import_node_http = require("node:http");
var import_node_crypto2 = require("node:crypto");
var import_server = require("@modelcontextprotocol/sdk/server/index.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_streamableHttp = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
var import_types = require("@modelcontextprotocol/sdk/types.js");
init_SerperAPI();

// src/tools/SearchTools.ts
init_errors();
init_LinkResolution();

// src/tools/ResolveLinks.ts
var import_node_crypto = require("node:crypto");
init_errors();
init_LinkResolution();
var SEARCH_CACHE_MAX = 50;
var RESOLVE_MAX_LINKS = 100;
var errMsg = (err) => err instanceof Error ? err.message : String(err);
var LinkResolver = class {
  constructor(api) {
    // Recent searches that still contain goto links, so resolve_links can finish
    // them later without the caller re-sending the raw response. In HTTP mode
    // one resolver serves every client, so ids are random 128-bit tokens: an id
    // cannot be guessed from another one, and one from before a restart cannot
    // match a different search afterwards.
    this.searches = /* @__PURE__ */ new Map();
    this.api = api;
  }
  /** Apply the link-resolution mode to a search response. Never throws on /resolve failure. */
  async apply(data, ctx) {
    const res = {
      data,
      unresolved: ctx.countShown(data),
      retryAfter: null,
      resolveError: null,
      searchId: null
    };
    if (ctx.mode === "all" && res.unresolved) {
      try {
        const r = await this.api.resolve(data);
        res.data = { ...r.data, credits: data.credits, provider: data.provider, cache_hit: data.cache_hit };
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
  remember(entry) {
    const id = (0, import_node_crypto.randomBytes)(16).toString("base64url");
    this.searches.set(id, entry);
    while (this.searches.size > SEARCH_CACHE_MAX) {
      this.searches.delete(this.searches.keys().next().value);
    }
    return id;
  }
  /** resolve_links tool: by search_id (re-renders that search) or by a list of goto links. */
  async resolveLinksTool(args) {
    const maxWait = Math.min(Math.max(Number(args["max_wait_seconds"] ?? defaultResolveMaxWaitS()) || 0, 0), 300);
    if (Array.isArray(args["links"]) && args["links"].length) {
      const links = args["links"].map(String);
      const gotoIdx = links.map((l, i) => isGotoLink(l) ? i : -1).filter((i) => i >= 0);
      const resolved = /* @__PURE__ */ new Map();
      let unresolved = 0;
      let retryAfter2 = null;
      if (gotoIdx.length) {
        const r = await this.api.resolve({ links: gotoIdx.map((i) => links[i]) }, maxWait);
        const out = r.data["links"];
        gotoIdx.forEach((i, j) => resolved.set(i, String(out[j])));
        unresolved = r.unresolved;
        retryAfter2 = r.retryAfter;
      }
      const lines = [`## \u{1F517} Resolved ${gotoIdx.length - unresolved} of ${gotoIdx.length} Google redirect link(s) (free)
`];
      links.forEach((l, i) => {
        const r = resolved.get(i);
        if (r === void 0) lines.push(`${i + 1}. ${l} (not a Google redirect link; unchanged)`);
        else if (isGotoLink(r)) lines.push(`${i + 1}. \u23F3 not resolved yet: ${l}`);
        else lines.push(`${i + 1}. ${r}`);
      });
      if (unresolved) {
        lines.push(
          `
${unresolved} still unresolved. Call resolve_links again with the same links${retryAfter2 ? ` after ${retryAfter2} s (Serper's suggestion)` : " later"}.`
        );
      }
      return lines.join("\n");
    }
    const id = String(args["search_id"]).trim();
    const entry = this.searches.get(id);
    if (!entry) {
      throw new ValidationError(
        `unknown search_id "${id}" (evicted, or from an earlier server process); re-run the search or pass links`
      );
    }
    const before = entry.countShown(entry.data);
    let attempts = 0;
    let retryAfter = null;
    if (countGotoLinks(entry.data)) {
      const r = await this.api.resolve(entry.data, maxWait);
      entry.data = { ...r.data, credits: entry.data.credits, provider: entry.data.provider, cache_hit: entry.data.cache_hit };
      attempts = r.attempts;
      retryAfter = r.retryAfter;
    }
    const after = entry.countShown(entry.data);
    const credits = entry.data.credits;
    const status = `> Resolved ${before - after} of ${before} Google redirect link(s) shown (/resolve is free, ${attempts} call(s)${credits !== void 0 ? `; the original search used ${credits} credit(s)` : ""}).

`;
    return status + entry.render(
      { ...entry.data, credits: void 0 },
      { unresolved: after, searchId: after ? id : null, retryAfter }
    );
  }
  static validateArgs(a) {
    const hasId = typeof a["search_id"] === "string" && a["search_id"].trim() !== "";
    const hasLinks = Array.isArray(a["links"]) && a["links"].length > 0;
    if (hasId === hasLinks) throw new ValidationError("pass exactly one of search_id or links");
    if (hasLinks) {
      const links = a["links"];
      if (links.length > RESOLVE_MAX_LINKS) throw new ValidationError(`at most ${RESOLVE_MAX_LINKS} links per call`);
      if (!links.every((l) => typeof l === "string")) throw new ValidationError("links must be strings");
    }
    if (a["max_wait_seconds"] !== void 0) {
      const n = Number(a["max_wait_seconds"]);
      if (!Number.isFinite(n) || n < 0 || n > 300) throw new ValidationError("max_wait_seconds must be 0-300");
    }
  }
};

// src/tools/SearchTools.ts
var SearchTools = class {
  static getAllTools() {
    return [
      this.unifiedSearch(),
      this.webSearch(),
      this.imageSearch(),
      this.videoSearch(),
      this.newsSearch(),
      this.shoppingSearch(),
      this.placesSearch(),
      this.scholarSearch(),
      this.patentsSearch(),
      this.autocompleteTool(),
      this.scrapeTool(),
      this.batchSearch(),
      this.deepResearch(),
      this.ragContext(),
      this.resolveLinksTool()
    ];
  }
  static localeParams() {
    return {
      country: { type: "string", description: 'ISO 3166-1 alpha-2 country code (e.g. "US", "GB"). Default: "US".' },
      search_lang: { type: "string", description: 'Language code (e.g. "en", "de"). Default: "en".' },
      ui_lang: { type: "string", description: 'UI language (e.g. "en-US"). Default: "en".' }
    };
  }
  static numResults(max = 20, def = 10) {
    return { num_results: { type: "number", description: `Results (1\u2013${max}, default ${def}). Note: >10 results uses 2 Serper credits.`, minimum: 1, maximum: max, default: def } };
  }
  static freshness(def) {
    return { freshness: { type: "string", description: `Time filter: pd=day pw=week pm=month py=year.${def ? ` Default: "${def}".` : ""}`, enum: ["pd", "pw", "pm", "py"] } };
  }
  static safesearch() {
    return { safesearch: { type: "string", description: '"off" | "moderate" | "strict". Default: "moderate".', enum: ["off", "moderate", "strict"], default: "moderate" } };
  }
  static verbosityParam() {
    return {
      verbosity: {
        type: "string",
        description: "Output density: auto (server picks per audience), compact (~800 tokens, dev fast path), standard (KG+Box+10), full (everything, always for places/shopping/images/scholar). Default: auto.",
        enum: ["auto", "compact", "standard", "full"],
        default: "auto"
      },
      max_chars: {
        type: "number",
        description: "Truncate response to this many characters (0 = no limit).",
        minimum: 0
      },
      snippets_only: {
        type: "boolean",
        description: "Return 1-line snippets only (token-saving for agents). Default: false.",
        default: false
      },
      provider: {
        type: "string",
        description: "Search backend: auto (failover chain), serper, tavily, brave, exa, firecrawl. Default: auto.",
        default: "auto"
      }
    };
  }
  static linkResolution() {
    return {
      link_resolution: {
        type: "string",
        enum: [...LINK_MODES],
        description: 'Google result links beyond the top 3 may come back as google.com/goto redirects. "auto" (default): top 3 resolved, any leftover goto links get a search_id for resolve_links. "all": also resolve every link now (free, but adds ~30 s when goto links are present). "none": fastest, links exactly as Google returns them.'
      }
    };
  }
  static unifiedSearch() {
    return {
      name: "search",
      description: "Unified search \u2014 one tool for all types (loads ~700 tokens instead of ~7k for 11 tools). Pick type=web|images|videos|news|shopping|places|scholar|patents|autocomplete and provider=auto|serper|tavily|brave|exa|firecrawl. Credit budget: basic 3 / standard 5 / deep 8 credits for deep_research; 1 credit per search; cache hits cost 0.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (max 400 chars / 50 words)." },
          type: {
            type: "string",
            description: "Result type.",
            enum: ["web", "images", "videos", "news", "shopping", "places", "scholar", "patents", "autocomplete"],
            default: "web"
          },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.freshness(),
          ...this.safesearch(),
          ...this.verbosityParam(),
          ...this.linkResolution()
        },
        required: ["query"]
      }
    };
  }
  static webSearch() {
    return {
      name: "search_web",
      description: "Google web search via Serper API. Returns organic results plus Knowledge Graph, Answer Box, People Also Ask, and related searches.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (max 400 chars / 50 words)." },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.freshness(),
          ...this.safesearch(),
          ...this.verbosityParam(),
          autocorrect: { type: "boolean", description: "Auto-correct spelling. Default: true.", default: true },
          summary: { type: "boolean", description: "Request Serper AI summary. Default: false.", default: false },
          page: { type: "number", description: "Page number for pagination. Default: 1.", minimum: 1, default: 1 },
          ...this.linkResolution()
        },
        required: ["query"]
      }
    };
  }
  static imageSearch() {
    return {
      name: "search_images",
      description: "Google Image search via Serper API. Returns image URLs, thumbnails, dimensions, and source pages. Use layout=gallery for a renderable visual grid (designers/moodboards). Always rich \u2014 never compacted.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Image search query." },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.safesearch(),
          ...this.verbosityParam(),
          size: { type: "string", description: "Image size filter.", enum: ["small", "medium", "large", "xlarge"] },
          orientation: { type: "string", description: "Aspect filter (client-side via W\xD7H).", enum: ["landscape", "portrait", "square"] },
          color: { type: "string", description: "Dominant color filter (e.g. blue, red, green)." },
          site: { type: "string", description: "Restrict to domain (e.g. dribbble.com, behance.net, unsplash.com)." },
          layout: { type: "string", description: "list (default) or gallery (renderable ![thumb] grid).", enum: ["list", "gallery"], default: "list" },
          ...this.linkResolution()
        },
        required: ["query"]
      }
    };
  }
  static videoSearch() {
    return {
      name: "search_videos",
      description: "Google Video search via Serper API. Returns titles, channels, durations, and links.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Video search query." },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.freshness(),
          ...this.safesearch(),
          ...this.linkResolution()
        },
        required: ["query"]
      }
    };
  }
  static newsSearch() {
    return {
      name: "search_news",
      description: "Google News search via Serper API. Returns headlines, sources, and publication dates.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "News search query." },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.freshness("pd"),
          ...this.safesearch(),
          ...this.linkResolution()
        },
        required: ["query"]
      }
    };
  }
  static shoppingSearch() {
    return {
      name: "search_shopping",
      description: "Google Shopping search via Serper API. Returns products with prices, ratings, and delivery info.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Product or shopping query." },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.linkResolution()
        },
        required: ["query"]
      }
    };
  }
  static placesSearch() {
    return {
      name: "search_places",
      description: "Google Places / Maps search via Serper API. Returns local businesses with address, phone, full 7-day hours, ratings, GPS + Directions links. Always rich \u2014 never compacted.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: 'Place or business query (e.g. "coffee shops in Tokyo").' },
          ...this.numResults(20, 5),
          ...this.localeParams(),
          ...this.verbosityParam(),
          open_now_only: { type: "boolean", description: "Filter to currently-open places (client-side via hours text). Default: false.", default: false },
          min_rating: { type: "number", description: "Minimum rating filter (e.g. 4.5).", minimum: 0, maximum: 5 },
          sort_by: { type: "string", description: "Sort results.", enum: ["rating", "reviews"] }
        },
        required: ["query"]
      }
    };
  }
  static scholarSearch() {
    return {
      name: "search_scholar",
      description: "Google Scholar search via Serper API. Returns academic publications with authors, journal, year, and citation counts. Ideal for research papers and literature reviews.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Academic search query (max 400 chars / 50 words)." },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.freshness()
        },
        required: ["query"]
      }
    };
  }
  static patentsSearch() {
    return {
      name: "search_patents",
      description: "Google Patents search via Serper API. Returns patents with publication number, assignee, inventor, and dates. Always rich.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Patent search query (max 400 chars / 50 words)." },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.verbosityParam()
        },
        required: ["query"]
      }
    };
  }
  static autocompleteTool() {
    return {
      name: "autocomplete",
      description: "Google Autocomplete suggestions via Serper API. Returns query completions \u2014 cheap, no LLM needed.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Partial query to complete." },
          ...this.numResults(10, 10),
          ...this.localeParams()
        },
        required: ["query"]
      }
    };
  }
  static scrapeTool() {
    return {
      name: "scrape",
      description: "Fetch and extract the full contents of a single URL via Serper Scrape API. Returns the page content as markdown (or plain text). Use after a search to read a promising page in full. Costs ~2 credits per page.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Absolute URL of the page to scrape (http/https)." },
          include_markdown: { type: "boolean", description: "Return a markdown rendering of the page. Default: true.", default: true },
          include_images: { type: "boolean", description: "Include image URLs found on the page. Default: false.", default: false },
          include_links: { type: "boolean", description: "Include links found on the page. Default: false.", default: false },
          include_videos: { type: "boolean", description: "Include videos found on the page. Default: false.", default: false },
          max_chars: { type: "number", description: "Truncate returned content to this many characters (1000\u2013200000). Default: 50000.", minimum: 1e3, maximum: 2e5, default: 5e4 }
        },
        required: ["url"]
      }
    };
  }
  static batchSearch() {
    return {
      name: "search_many",
      description: "Run multiple web searches in one call (parallel). Duplicate URLs across queries are removed automatically. Great for comparing topics, gathering multi-angle context, or fanning out sub-queries. Each query costs 1 credit.",
      inputSchema: {
        type: "object",
        properties: {
          queries: {
            type: "array",
            items: { type: "string" },
            description: "Search queries (1\u201310 items, each max 400 chars / 50 words).",
            minItems: 1,
            maxItems: 10
          },
          ...this.numResults(20, 5),
          ...this.localeParams(),
          ...this.freshness(),
          ...this.safesearch()
        },
        required: ["queries"]
      }
    };
  }
  static deepResearch() {
    return {
      name: "deep_research",
      description: "AI-powered deep research tool. Breaks your question into sub-queries, runs multiple Google searches, then synthesizes a cited research report using your LLM (OpenRouter or Gemini). Requires OPENROUTER_API_KEY or GEMINI_API_KEY environment variable.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Research question or topic to investigate."
          },
          depth: {
            type: "string",
            description: 'Research depth: "basic" (3 sub-queries, fast), "standard" (5 sub-queries, balanced), "deep" (8 sub-queries, exhaustive). Default: "standard".',
            enum: ["basic", "standard", "deep"],
            default: "standard"
          },
          country: {
            type: "string",
            description: 'Country code for search localisation. Default: "US".',
            default: "US"
          }
        },
        required: ["query"]
      }
    };
  }
  static ragContext() {
    return {
      name: "search_rag_context",
      description: "Returns Google search results as clean, chunked, metadata-rich text optimized for embedding pipelines and vector databases. No LLM required. Each chunk includes: text, source URL, domain, title, date, word count, and chunk index. Perfect for RAG pipelines, semantic search, and AI grounding.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query to retrieve and chunk."
          },
          num_results: {
            type: "number",
            description: "Number of web results to fetch (1\u201320, default 10).",
            minimum: 1,
            maximum: 20,
            default: 10
          },
          country: { type: "string", description: 'Country code. Default: "US".' },
          ...this.freshness(),
          max_chunk_words: {
            type: "number",
            description: "Maximum words per chunk (default 200). Lower = more chunks, finer granularity.",
            minimum: 50,
            maximum: 1e3,
            default: 200
          },
          include_paa: {
            type: "boolean",
            description: 'Include "People Also Ask" Q&A pairs as extra chunks. Default: true.',
            default: true
          },
          output_format: {
            type: "string",
            description: '"json" (structured, for vector DBs) or "text" (plain blocks, for direct prompt use). Default: "json".',
            enum: ["json", "text"],
            default: "json"
          },
          ...this.linkResolution()
        },
        required: ["query"]
      }
    };
  }
  static resolveLinksTool() {
    return {
      name: "resolve_links",
      description: "Turn google.com/goto redirect links from a recent search into real URLs via Serper /resolve (free, 0 credits). Pass the search_id a search result asked for, or a list of goto links. Right after a search one call takes ~20\u201330 s. Links not ready yet stay goto links; Serper then suggests a wait (often 90 s), which is only honoured if it fits in max_wait_seconds \u2014 otherwise call again later.",
      inputSchema: {
        type: "object",
        properties: {
          search_id: { type: "string", description: "search_id shown in a search result that still had goto links." },
          links: { type: "array", items: { type: "string" }, description: "google.com/goto?url=\u2026 links to resolve (alternative to search_id, max 100).", maxItems: 100 },
          max_wait_seconds: { type: "number", description: "Retry within this budget when Serper says to wait (default 60).", minimum: 0, maximum: 300, default: 60 }
        },
        required: []
      }
    };
  }
  static validateArgs(toolName, args) {
    const tool = this.getAllTools().find((t) => t.name === toolName);
    if (!tool) throw new ValidationError(`Unknown tool: ${toolName}`);
    if (typeof args !== "object" || args === null) throw new ValidationError("Arguments must be an object");
    for (const key of tool.inputSchema.required) {
      if (!(key in args)) throw new ValidationError(`Missing required parameter: ${key}`);
    }
    const a = args;
    if (typeof a["query"] === "string") {
      const q = a["query"].trim();
      if (!q) throw new ValidationError("query must not be empty");
      if (q.length > 400) throw new ValidationError("query exceeds 400 characters");
      if (q.split(/\s+/).length > 50) throw new ValidationError("query exceeds 50 words");
    }
    if (Array.isArray(a["queries"])) {
      const queries = a["queries"];
      if (queries.length < 1) throw new ValidationError("queries must contain at least 1 query");
      if (queries.length > 10) throw new ValidationError("queries exceeds 10 items");
      for (const q of queries) {
        if (typeof q !== "string" || !q.trim()) throw new ValidationError("each query must be a non-empty string");
        const trimmed = q.trim();
        if (trimmed.length > 400) throw new ValidationError("each query must be at most 400 characters");
        if (trimmed.split(/\s+/).length > 50) throw new ValidationError("each query must be at most 50 words");
      }
    }
    if (toolName === "scrape") {
      const url = a["url"];
      if (typeof url !== "string" || !/^https?:\/\/.+/i.test(url)) {
        throw new ValidationError("url must be an absolute http(s) URL");
      }
    }
    if (a["verbosity"] !== void 0) {
      const v = a["verbosity"];
      if (!["auto", "compact", "standard", "full"].includes(v)) {
        throw new ValidationError("verbosity must be auto|compact|standard|full");
      }
    }
    if (a["provider"] !== void 0 && typeof a["provider"] === "string") {
      const p = a["provider"].toLowerCase();
      if (!["auto", "serper", "tavily", "brave", "exa", "firecrawl", "all"].includes(p)) {
        throw new ValidationError("provider must be auto|serper|tavily|brave|exa|firecrawl|all");
      }
    }
    if (a["link_resolution"] !== void 0 && !LINK_MODES.includes(a["link_resolution"])) {
      throw new ValidationError(`link_resolution must be ${LINK_MODES.join("|")}`);
    }
    if (toolName === "resolve_links") LinkResolver.validateArgs(a);
    if (a["max_chars"] !== void 0) {
      const n = Number(a["max_chars"]);
      if (!Number.isFinite(n) || n < 0) throw new ValidationError("max_chars must be >= 0");
    }
    if (a["min_rating"] !== void 0) {
      const n = Number(a["min_rating"]);
      if (!Number.isFinite(n) || n < 0 || n > 5) throw new ValidationError("min_rating must be 0-5");
    }
    if (a["type"] !== void 0 && toolName === "search") {
      const t = a["type"].toLowerCase();
      if (!["web", "images", "videos", "news", "shopping", "places", "scholar", "patents", "autocomplete"].includes(t)) {
        throw new ValidationError("type must be web|images|videos|news|shopping|places|scholar|patents|autocomplete");
      }
    }
  }
};

// src/server/SerperMCPServer.ts
init_Router();
init_ResultFormatter();
init_DeepResearch();
init_RAGContext();

// src/tools/BatchSearch.ts
init_Concurrency();
var MAX_CONCURRENCY = RESEARCH_CONCURRENCY;
async function runBatchSearch(queries, options, api) {
  const numResults = Math.min(20, Math.max(1, Math.floor(Number(options.num_results)) || 5));
  const perQuery = await mapWithConcurrency(queries, MAX_CONCURRENCY, async (query) => {
    try {
      const data = await api.search(query, "web", {
        num_results: numResults,
        country: options.country,
        search_lang: options.search_lang,
        ui_lang: options.ui_lang,
        freshness: options.freshness,
        safesearch: options.safesearch,
        autocorrect: true
      });
      return { query, results: (data.organic ?? []).slice(0, numResults) };
    } catch (err) {
      return {
        query,
        results: [],
        error: err instanceof Error ? err.message : String(err)
      };
    }
  });
  const seen = /* @__PURE__ */ new Set();
  let dedupedCount = 0;
  const lines = [`## \u{1F500} Batch Search \u2014 ${perQuery.length} ${perQuery.length === 1 ? "query" : "queries"}
`];
  for (const [i, r] of perQuery.entries()) {
    if (r.error) {
      lines.push(`### ${i + 1}. "${r.query}" \u2014 \u26A0\uFE0F failed`);
      lines.push(`\u26A0\uFE0F ${r.error}`);
      lines.push("");
      continue;
    }
    lines.push(`### ${i + 1}. "${r.query}" \u2014 ${r.results.length} results
`);
    if (!r.results.length) {
      lines.push("*No results found.*\n");
      continue;
    }
    let shown = 0;
    for (const res of r.results) {
      if (res.link && seen.has(res.link)) {
        dedupedCount++;
        continue;
      }
      if (res.link) seen.add(res.link);
      shown++;
      lines.push(`**${shown}. [${res.title}](${res.link})**`);
      if (res.date) lines.push(`*${res.date}*`);
      if (res.snippet) lines.push(res.snippet);
      lines.push("");
    }
    if (!shown) lines.push("*All results were duplicates of earlier queries.*\n");
  }
  if (dedupedCount > 0) {
    lines.push(`---
*Removed ${dedupedCount} duplicate URL${dedupedCount === 1 ? "" : "s"} across queries.*`);
  }
  return lines.join("\n");
}

// src/server/SerperMCPServer.ts
init_LinkResolution();
init_DeepResearch();
init_Logger();
init_errors();
init_Metrics();

// package.json
var version = "4.0.1";

// src/server/SerperMCPServer.ts
if (!globalThis.crypto) {
  globalThis.crypto = import_node_crypto2.webcrypto;
}
var SEARCH_TYPE_MAP = {
  search: "web",
  // unified tool resolves type from args
  search_web: "web",
  search_images: "images",
  search_videos: "videos",
  search_news: "news",
  search_shopping: "shopping",
  search_places: "places",
  search_scholar: "scholar",
  search_patents: "patents",
  autocomplete: "autocomplete"
};
function isAuthorized(authorization, token) {
  if (!token) return true;
  if (!authorization) return false;
  const expected = `Bearer ${token}`;
  const a = Buffer.from(authorization, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    return (0, import_node_crypto2.timingSafeEqual)(a, b);
  } catch {
    return false;
  }
}
var SerperMCPServer = class {
  constructor(options = {}) {
    this.config = {
      apiKey: options.apiKey || process.env.SERPER_API_KEY || "",
      transport: options.transport || process.env.SERPER_MCP_TRANSPORT || "stdio",
      port: options.port || parseInt(process.env.SERPER_MCP_PORT || "8080", 10),
      host: options.host || process.env.SERPER_MCP_HOST || "0.0.0.0",
      logLevel: options.logLevel || process.env.SERPER_MCP_LOG_LEVEL || "info",
      authToken: options.authToken || process.env.SERPER_MCP_AUTH_TOKEN || void 0
    };
    setLogLevel(this.config.logLevel);
    if (!this.config.apiKey) throw new AuthError("SERPER_API_KEY is required");
    this.api = new SerperAPI(this.config.apiKey);
    this.router = new ProviderRouter(this.api);
    this.links = new LinkResolver(this.api);
  }
  /**
   * Build a fully-configured MCP server instance.
   * HTTP mode creates one per request (stateless); stdio mode uses a single instance.
   */
  buildServer() {
    const server = new import_server.Server(
      { name: "serper-search-mcp", version },
      { capabilities: { tools: {} } }
    );
    this.registerHandlers(server);
    return server;
  }
  registerHandlers(server) {
    server.setRequestHandler(import_types.ListToolsRequestSchema, async () => ({
      tools: SearchTools.getAllTools()
    }));
    server.setRequestHandler(import_types.CallToolRequestSchema, async (req) => {
      setRequestId((0, import_node_crypto2.randomUUID)().slice(0, 8));
      const { name, arguments: args } = req.params;
      const knownTool = name in SEARCH_TYPE_MAP || name === "deep_research" || name === "search_rag_context" || name === "scrape" || name === "search_many" || name === "search_maps" || name === "search_reviews" || name === "search_lens" || name === "resolve_links";
      if (!knownTool) throw new import_types.McpError(import_types.ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      try {
        SearchTools.validateArgs(name, args);
        const a = args;
        if (name === "resolve_links") {
          const text = await this.links.resolveLinksTool(a);
          return { content: [{ type: "text", text }] };
        }
        if (name === "scrape") {
          const url = a["url"];
          const maxChars = Math.min(2e5, Math.max(1e3, Math.floor(Number(a["max_chars"])) || 5e4));
          const data = await this.api.scrape(url, {
            includeMarkdown: a["include_markdown"] ?? true,
            includeImages: a["include_images"] ?? false,
            includeLinks: a["include_links"] ?? false,
            includeVideos: a["include_videos"] ?? false
          });
          const text = ResultFormatter.formatScrape(data, url, maxChars);
          return { content: [{ type: "text", text }] };
        }
        if (name === "search_many") {
          const text = await runBatchSearch(
            a["queries"],
            {
              num_results: a["num_results"] ?? 5,
              country: a["country"] ?? "US",
              search_lang: a["search_lang"] ?? "en",
              ui_lang: a["ui_lang"] ?? "en",
              freshness: a["freshness"],
              safesearch: a["safesearch"] ?? "moderate"
            },
            this.api
          );
          return { content: [{ type: "text", text }] };
        }
        if (name === "deep_research") {
          const result = await runDeepResearch(
            a["query"],
            a["depth"] ?? "standard",
            a["country"] ?? "US",
            this.api
          );
          const header = [
            `## \u{1F52C} Deep Research Report`,
            `**Query:** ${result.query}`,
            `**Depth:** ${result.depth} | **Sources:** ${result.sourceCount} | **LLM:** ${result.model} (${result.provider})`,
            `**Sub-queries explored:**`,
            ...result.subQueries.map((q, i) => `${i + 1}. ${q}`),
            "",
            "---",
            ""
          ].join("\n");
          return { content: [{ type: "text", text: header + result.report + deepResearchLinkFooter(result) }] };
        }
        if (name === "search_rag_context") {
          const text = await buildRAGContext(
            a["query"],
            {
              num_results: a["num_results"] ?? 10,
              country: a["country"] ?? "US",
              freshness: a["freshness"],
              max_chunk_words: a["max_chunk_words"] ?? 200,
              include_paa: a["include_paa"] ?? true,
              output_format: a["output_format"] ?? "json",
              link_resolution: a["link_resolution"] ?? defaultLinkMode()
            },
            this.api,
            this.links
          );
          return { content: [{ type: "text", text }] };
        }
        if (name === "search_maps" || name === "search_reviews" || name === "search_lens") {
          const hint = name === "search_maps" ? "Use search_places instead \u2014 same Serper places index with address/phone/hours/GPS." : name === "search_reviews" ? 'Use search_places (ratings + review counts) or search_web with "<place> reviews".' : "Use search_images with a site filter (e.g. site=dribbble.com) for visual discovery.";
          return { content: [{ type: "text", text: `## \u26A0\uFE0F ${name} is not a separate Serper endpoint

${hint}` }] };
        }
        let searchType = SEARCH_TYPE_MAP[name];
        if (!searchType) throw new import_types.McpError(import_types.ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        if (name === "search" && typeof a["type"] === "string") {
          const t = a["type"].toLowerCase();
          if (t in SEARCH_TYPE_MAP || ["web", "images", "videos", "news", "shopping", "places", "scholar", "patents", "autocomplete"].includes(t)) {
            searchType = t;
          }
        }
        return await this.runSearch(a, searchType);
      } catch (err) {
        if (err instanceof import_types.McpError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        if (err instanceof ValidationError) throw new import_types.McpError(import_types.ErrorCode.InvalidParams, msg);
        throw new import_types.McpError(import_types.ErrorCode.InternalError, msg);
      } finally {
        setRequestId("");
      }
    });
    server.onerror = (err) => logger.error("[MCP error]", err);
  }
  async runSearch(args, searchType) {
    const verbosity = args["verbosity"] ?? "auto";
    const numResults = effectiveFetchCount(args["num_results"], verbosity === "auto" ? "standard" : verbosity, searchType);
    const maxChars = args["max_chars"] !== void 0 ? Math.max(0, Math.floor(Number(args["max_chars"]))) : void 0;
    const opts = {
      num_results: numResults,
      country: args["country"] ?? "US",
      search_lang: args["search_lang"] ?? "en",
      ui_lang: args["ui_lang"] ?? "en",
      freshness: args["freshness"] ?? (searchType === "news" ? "pd" : void 0),
      safesearch: args["safesearch"] ?? "moderate",
      summary: args["summary"] ?? false,
      autocorrect: args["autocorrect"] ?? true,
      page: args["page"] ?? 1,
      verbosity,
      max_chars: maxChars,
      snippets_only: args["snippets_only"] ?? false,
      provider: args["provider"] ?? "auto",
      link_resolution: args["link_resolution"] ?? defaultLinkMode()
    };
    let query = args["query"];
    if (searchType === "images" && typeof args["site"] === "string" && args["site"]) {
      query = `site:${args["site"]} ${query}`;
    }
    const data = await this.router.search(query, searchType, opts);
    const render = (d) => searchType === "places" ? this.formatPlacesWithFilters(d, numResults, args, maxChars) : ResultFormatter.format(d, numResults, searchType, {
      verbosity,
      maxChars,
      snippetsOnly: opts.snippets_only
    });
    const r = await this.links.apply(data, {
      mode: opts.link_resolution ?? "auto",
      countShown: (d) => shownGotoCount(d, searchType, numResults, verbosity),
      render: (d, state) => render(d) + unresolvedNote(state)
    });
    const text = render(r.data) + unresolvedNote(r);
    return { content: [{ type: "text", text }] };
  }
  formatPlacesWithFilters(data, numResults, args, maxChars) {
    const minRating = args["min_rating"] !== void 0 ? Number(args["min_rating"]) : void 0;
    const sortBy = args["sort_by"];
    const filtered = ResultFormatter.formatPlaces(data.places ?? [], numResults, {
      minRating: Number.isFinite(minRating) ? minRating : void 0,
      sortBy: sortBy === "rating" || sortBy === "reviews" ? sortBy : void 0
    });
    const footer = `

---
*Provider: ${data.provider ?? "serper"} \xB7 Cache: ${data.cache_hit ? "hit (0 credits)" : "miss"}${data.credits !== void 0 ? ` \xB7 Serper credits used: ${data.credits}` : ""}*`;
    let text = [`## \u{1F4CD} Places Search Results${data.searchParameters?.q ? ` \u2014 "${data.searchParameters.q}"` : ""}
`, ...filtered].join("\n") + footer;
    if (maxChars && maxChars > 0 && text.length > maxChars) {
      text = text.slice(0, maxChars) + `

\u2026[truncated to ${maxChars.toLocaleString()} chars]`;
    }
    return text;
  }
  /**
   * Streamable HTTP transport — stateless mode.
   *   POST /mcp     MCP JSON-RPC endpoint
   *   GET  /health  container/load-balancer health probe
   */
  async runHttp() {
    const MAX_BODY_BYTES = 256 * 1024;
    const httpServer = (0, import_node_http.createServer)(async (req, res) => {
      setRequestId((0, import_node_crypto2.randomUUID)().slice(0, 8));
      try {
        const contentLength = Number(req.headers["content-length"]);
        if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Request body too large (max ${MAX_BODY_BYTES} bytes)` }));
          return;
        }
        const pathname = (req.url ?? "/").split("?")[0];
        if (pathname === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            status: "ok",
            name: "serper-search-mcp",
            version,
            auth_required: Boolean(this.config.authToken),
            uptime_s: Math.round(process.uptime()),
            metrics: snapshot()
          }));
          return;
        }
        if (pathname === "/mcp") {
          if (!isAuthorized(req.headers.authorization, this.config.authToken)) {
            res.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" });
            res.end(JSON.stringify({ error: "Unauthorized \u2014 send Authorization: Bearer <SERPER_MCP_AUTH_TOKEN>" }));
            return;
          }
          const server = this.buildServer();
          const transport = new import_streamableHttp.StreamableHTTPServerTransport({ sessionIdGenerator: void 0 });
          res.on("close", () => {
            void transport.close();
            void server.close();
          });
          await server.connect(transport);
          await transport.handleRequest(req, res);
          return;
        }
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found. MCP endpoint: POST /mcp" }));
      } catch (err) {
        if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      } finally {
        setRequestId("");
      }
    });
    await new Promise((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(this.config.port, this.config.host, resolve);
    });
    httpServer.timeout = 12e4;
    httpServer.keepAliveTimeout = 5e3;
    const shutdown = () => {
      logger.info("Shutting down HTTP server\u2026");
      httpServer.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1e4).unref();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    logger.info(
      `Serper Search MCP Server v${version} \u2014 HTTP listening on http://${this.config.host}:${this.config.port}/mcp (health: /health${this.config.authToken ? " \xB7 bearer auth enabled" : ""})`
    );
  }
  async run() {
    if (this.config.transport === "http") {
      await this.runHttp();
      return;
    }
    const server = this.buildServer();
    process.on("SIGINT", () => server.close().then(() => process.exit(0)));
    process.on("SIGTERM", () => server.close().then(() => process.exit(0)));
    await server.connect(new import_stdio.StdioServerTransport());
    logger.info(`Serper Search MCP Server v${version} \u2014 SMLabs AI`);
  }
};

// src/utils/EnvCheck.ts
var KNOWN_ENV = /* @__PURE__ */ new Set([
  // server
  "SERPER_API_KEY",
  "SERPER_MCP_TRANSPORT",
  "SERPER_MCP_PORT",
  "SERPER_MCP_HOST",
  "SERPER_MCP_AUTH_TOKEN",
  "SERPER_MCP_LOG_LEVEL",
  // tuning (read lazily via numberFromEnv)
  "SERPER_CACHE_TTL_MS",
  "SERPER_CACHE_MAX",
  "SERPER_TIMEOUT_MS",
  "SERPER_RETRIES",
  "SERPER_RETRY_BASE_MS",
  "SERPER_LLM_TIMEOUT_MS",
  "SERPER_LLM_RETRIES",
  // Google redirect-link resolution
  "SERPER_LINK_RESOLUTION",
  "SERPER_RESOLVE_MAX_WAIT",
  // provider routing
  "SEARCH_PROVIDER_ORDER",
  "SEARCH_FALLBACK"
]);
var LOG_LEVELS = ["error", "warn", "info", "debug", "silent"];
var PROVIDER_NAMES = ["serper", "tavily", "brave", "exa", "firecrawl"];
function findUnknownEnvKeys(env = process.env) {
  return Object.keys(env).filter((key) => /^(SERPER|SEARCH)_/.test(key) && !KNOWN_ENV.has(key)).sort();
}
function validateEnv(env = process.env) {
  const warnings = [];
  for (const key of findUnknownEnvKeys(env)) {
    warnings.push(`Unknown env var ${key} will be ignored (possible typo \u2014 see --help for the full list)`);
  }
  const transport = env.SERPER_MCP_TRANSPORT;
  if (transport && !["stdio", "http"].includes(transport)) {
    warnings.push(`SERPER_MCP_TRANSPORT must be stdio|http (got "${transport}") \u2014 falling back to stdio`);
  }
  const level = env.SERPER_MCP_LOG_LEVEL;
  if (level && !LOG_LEVELS.includes(level.toLowerCase())) {
    warnings.push(`SERPER_MCP_LOG_LEVEL must be ${LOG_LEVELS.join("|")} (got "${level}") \u2014 falling back to info`);
  }
  const port = env.SERPER_MCP_PORT;
  if (port !== void 0 && port !== "" && !(Number.isInteger(Number(port)) && Number(port) > 0 && Number(port) <= 65535)) {
    warnings.push(`SERPER_MCP_PORT must be an integer 1-65535 (got "${port}") \u2014 falling back to 8080`);
  }
  const linkMode = env.SERPER_LINK_RESOLUTION;
  if (linkMode && !["auto", "all", "none"].includes(linkMode)) {
    warnings.push(`SERPER_LINK_RESOLUTION must be auto|all|none (got "${linkMode}") \u2014 falling back to auto`);
  }
  const order = env.SEARCH_PROVIDER_ORDER;
  if (order) {
    const dropped = order.split(",").map((s) => s.trim()).filter((s) => s && !PROVIDER_NAMES.includes(s));
    if (dropped.length) {
      warnings.push(`SEARCH_PROVIDER_ORDER contains unknown provider(s): ${dropped.join(", ")} (valid: ${PROVIDER_NAMES.join(",")}) \u2014 they will be dropped from the failover chain`);
    }
  }
  return warnings;
}

// src/index.ts
function parseArgs() {
  const argv = process.argv.slice(2);
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--")) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next !== void 0 && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positional.push(tok);
    }
  }
  return { flags, positional };
}
async function runCliCommand(cmd, rest, flags) {
  const apiKey = flags["api-key"] === "true" || !flags["api-key"] ? process.env.SERPER_API_KEY ?? "" : flags["api-key"];
  if (!apiKey && cmd !== "providers" && cmd !== "status") {
    console.error("Fatal: SERPER_API_KEY is required (or --api-key <key>)");
    process.exit(1);
  }
  const { SerperAPI: SerperAPI2 } = await Promise.resolve().then(() => (init_SerperAPI(), SerperAPI_exports));
  const { ProviderRouter: ProviderRouter2 } = await Promise.resolve().then(() => (init_Router(), Router_exports));
  const { ResultFormatter: ResultFormatter2 } = await Promise.resolve().then(() => (init_ResultFormatter(), ResultFormatter_exports));
  const api = new SerperAPI2(apiKey);
  const router = new ProviderRouter2(api);
  const limit = flags["limit"] ? Math.max(1, Math.min(parseInt(flags["limit"], 10) || 5, 20)) : 5;
  const compact = flags["compact"] === "true" || flags["compact"] === "";
  const asJson = flags["json"] === "true" || flags["json"] === "";
  const provider = flags["provider"] ?? "auto";
  const verbosity = compact ? "compact" : "standard";
  if (cmd === "providers" || cmd === "status") {
    const rows = [
      { name: "serper", configured: Boolean(apiKey), note: "default, $3-5/1k, 2500 free" },
      { name: "tavily", configured: Boolean(process.env.TAVILY_API_KEY), note: "$8-16/1k, reranked" },
      { name: "brave", configured: Boolean(process.env.BRAVE_API_KEY), note: "$5/1k, independent" },
      { name: "exa", configured: Boolean(process.env.EXA_API_KEY), note: "$4-7/1k, neural" },
      { name: "firecrawl", configured: Boolean(process.env.FIRECRAWL_API_KEY), note: "~$3-4/1k eff, JS render" }
    ];
    if (asJson) console.log(JSON.stringify({ order: process.env.SEARCH_PROVIDER_ORDER ?? "serper,tavily,brave", fallback: process.env.SEARCH_FALLBACK ?? "true", providers: rows }, null, 2));
    else {
      console.log("Providers (order: " + (process.env.SEARCH_PROVIDER_ORDER ?? "serper,tavily,brave") + ", fallback: " + (process.env.SEARCH_FALLBACK ?? "true") + ")");
      for (const r of rows) console.log(`  ${r.configured ? "\u2705" : "\u274C"} ${r.name} \u2014 ${r.note}`);
    }
    return;
  }
  if (cmd === "search" || cmd === "scrape" || cmd === "research" || cmd === "rag") {
    const query = rest.join(" ").trim();
    if (!query && cmd !== "scrape") {
      console.error(`Usage: serper-search-mcp ${cmd} "<query>" [--compact --limit 5 --provider auto --json]`);
      process.exit(1);
    }
    if (cmd === "search") {
      const type = flags["type"] ?? "web";
      const validTypes = ["web", "images", "videos", "news", "shopping", "places", "scholar", "patents", "autocomplete"];
      if (!validTypes.includes(type)) {
        console.error(`Invalid search type: "${type}". Must be one of: ${validTypes.join(", ")}`);
        process.exit(1);
      }
      const data = await router.search(query, type, { num_results: limit, provider });
      if (asJson) console.log(JSON.stringify(data, null, 2));
      else console.log(ResultFormatter2.format(data, limit, type, { verbosity }));
      return;
    }
    if (cmd === "scrape") {
      const url = rest[0] ?? flags["url"] ?? "";
      const maxChars = Number(flags["max-chars"]) || 8e3;
      const data = await api.scrape(url);
      if (asJson) console.log(JSON.stringify(data, null, 2));
      else console.log(ResultFormatter2.formatScrape(data, url, maxChars));
      return;
    }
    if (cmd === "rag") {
      const { buildRAGContext: buildRAGContext2 } = await Promise.resolve().then(() => (init_RAGContext(), RAGContext_exports));
      const format = flags["format"] === "text" ? "text" : "json";
      console.log(await buildRAGContext2(query, { num_results: limit, output_format: format }, api));
      return;
    }
    if (cmd === "research") {
      const { runDeepResearch: runDeepResearch2 } = await Promise.resolve().then(() => (init_DeepResearch(), DeepResearch_exports));
      const depth = flags["depth"] ?? "basic";
      const result = await runDeepResearch2(query, depth, "US", api);
      if (asJson) console.log(JSON.stringify(result, null, 2));
      else console.log(result.report);
      return;
    }
  }
  console.error(`Unknown command: ${cmd}. Try: search|scrape|research|rag|providers|status`);
  process.exit(1);
}
async function main() {
  const { flags, positional } = parseArgs();
  for (const warning of validateEnv()) {
    console.error(`[serper-mcp] config warning: ${warning}`);
  }
  if ("help" in flags || positional[0] === "help") {
    console.log(`
Serper Search MCP Server v${version} \u2014 SMLabs AI

Usage (MCP server):
  npx serper-search-mcp [options]

Usage (CLI \u2014 dev power-tool):
  npx serper-search-mcp search "react server components" --compact --limit 5
  npx serper-search-mcp scrape https://example.com --max-chars 8000
  npx serper-search-mcp research "RAG limits" --depth basic
  npx serper-search-mcp rag "transformer" --format json
  npx serper-search-mcp providers --status

Options:
  --api-key <key>          Serper API key (or set SERPER_API_KEY env)
  --transport <stdio|http> Transport mode (default: stdio)
  --port <number>          HTTP port (default: 8080)
  --host <string>          HTTP host (default: 0.0.0.0)
  --auth-token <token>     Require bearer token on HTTP /mcp (or SERPER_MCP_AUTH_TOKEN)
  --log-level <level>      error | warn | info | debug | silent (default: info)
  --compact                CLI: compact output (~800 tokens)
  --limit <n>              CLI: results 1-20 (default: 5)
  --provider <name>        CLI: auto|serper|tavily|brave|exa|firecrawl|all
  --json                   CLI: raw JSON output
  --help                   Show this help

Environment variables:
  SERPER_API_KEY           Required \u2014 get one free at https://serper.dev
  SERPER_MCP_TRANSPORT     stdio | http
  SERPER_MCP_PORT          HTTP port
  SERPER_MCP_HOST          HTTP host
  SERPER_MCP_AUTH_TOKEN    Optional bearer token required on HTTP /mcp
  SERPER_MCP_LOG_LEVEL     error | warn | info | debug | silent
  SERPER_CACHE_TTL_MS      Search-result cache TTL (default 600000, 0 = disabled)
  SERPER_TIMEOUT_MS        Per-request timeout (default 30000)
  SERPER_RETRIES           Retries on 429/5xx/network errors (default 2)
  SERPER_LINK_RESOLUTION   Default link_resolution: auto | all | none (default auto)
  SERPER_RESOLVE_MAX_WAIT  Seconds /resolve may keep retrying when Serper says to wait (default 60)
  TAVILY_API_KEY           Fallback provider 1 (reranked)
  BRAVE_API_KEY            Fallback provider 2 (independent index)
  EXA_API_KEY              Fallback provider 3 (neural)
  FIRECRAWL_API_KEY        Scrape upgrade (JS render)
  SEARCH_PROVIDER_ORDER    Failover chain (default: serper,tavily,brave)
  SEARCH_FALLBACK          auto-failover on 402/429/5xx/empty (default: true)
  OPENROUTER_API_KEY       LLM key for deep_research
  GEMINI_API_KEY           LLM key for deep_research

Tools provided:
  search             Unified search {type, provider, verbosity} \u2014 1 schema (~700 tokens)
  search_web         Google web search with Knowledge Graph + Answer Box
  search_images      Google Image search (+ gallery layout, size/orientation/color/site)
  search_videos      Google Video search
  search_news        Google News search
  search_shopping    Google Shopping search (always rich)
  search_places      Google Places / Maps search (full hours, open_now, min_rating, sort)
  search_scholar     Google Scholar \u2014 academic papers with citation counts
  search_patents     Google Patents
  autocomplete       Query completions
  scrape             Fetch full page content as markdown
  search_many        Batch: 1\u201310 parallel searches with dedupe (max_credits guard)
  deep_research      Multi-step research: sub-queries, parallel search, LLM report (basic 3cr / standard 5cr / deep 8cr)
  search_rag_context Clean chunked text + metadata for RAG/embedding pipelines
  resolve_links      Turn google.com/goto redirect links into real URLs (free)
`);
    process.exit(0);
  }
  const subcommands = ["search", "scrape", "research", "rag", "providers", "status"];
  if (positional.length && subcommands.includes(positional[0])) {
    await runCliCommand(positional[0], positional.slice(1), flags);
    return;
  }
  try {
    const apiKey = flags["api-key"] === "true" ? void 0 : flags["api-key"];
    const authToken = flags["auth-token"] === "true" ? void 0 : flags["auth-token"];
    const server = new SerperMCPServer({
      apiKey,
      transport: flags["transport"] === "http" ? "http" : void 0,
      port: flags["port"] ? parseInt(flags["port"], 10) : void 0,
      host: flags["host"],
      authToken,
      logLevel: flags["log-level"]
    });
    await server.run();
  } catch (err) {
    console.error("Fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
if (require.main === module) {
  main();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SerperMCPServer
});
