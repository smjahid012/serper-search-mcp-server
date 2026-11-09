/**
 * TtlCache — SMLabs AI
 *
 * Tiny in-memory cache with per-entry TTL, LRU eviction, and optional disk persistence.
 * ttlMs <= 0 disables storage entirely (get always misses).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  private store = new Map<string, CacheEntry<V>>();
  private persistPath?: string;
  private saveTimeout?: NodeJS.Timeout;

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number = 200,
    persistPath?: string
  ) {
    this.persistPath = persistPath;
    if (this.persistPath) {
      this.loadFromDisk();
    }
  }

  private loadFromDisk(): void {
    if (!this.persistPath) return;
    try {
      if (!existsSync(this.persistPath)) return;
      const raw = readFileSync(this.persistPath, 'utf-8');
      const data = JSON.parse(raw) as Array<[string, CacheEntry<V>]>;
      const now = Date.now();
      if (Array.isArray(data)) {
        for (const [key, entry] of data) {
          if (entry && typeof entry.expiresAt === 'number' && entry.expiresAt > now) {
            this.store.set(key, entry);
          }
        }
      }
    } catch {
      // Ignore disk read error and fallback to memory store
    }
  }

  private scheduleSave(): void {
    if (!this.persistPath || this.ttlMs <= 0) return;
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.flushToDisk();
    }, 500);
    if (this.saveTimeout && typeof this.saveTimeout.unref === 'function') {
      this.saveTimeout.unref();
    }
  }

  public flushToDisk(): void {
    if (!this.persistPath) return;
    try {
      const now = Date.now();
      const validEntries: Array<[string, CacheEntry<V>]> = [];
      for (const [k, v] of this.store.entries()) {
        if (v && v.expiresAt > now) {
          validEntries.push([k, v]);
        }
      }
      const dir = dirname(this.persistPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.persistPath, JSON.stringify(validEntries), 'utf-8');
    } catch {
      // Silently ignore disk write errors
    }
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      this.scheduleSave();
      return undefined;
    }

    // Refresh LRU position: most recently used goes to the end
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.ttlMs <= 0) return;

    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });

    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }

    this.flushToDisk();
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
    this.flushToDisk();
  }
}
