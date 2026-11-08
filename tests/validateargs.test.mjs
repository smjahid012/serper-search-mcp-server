/**
 * Tool definition + argument validation tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SearchTools } from '../dist/tools/SearchTools.js';

describe('SearchTools', () => {
  it('exposes 14 tools including the v3.1/v3.2 additions', () => {
    const names = SearchTools.getAllTools().map((tool) => tool.name);
    assert.equal(names.length, 14);
    for (const name of [
      'search', 'search_web', 'search_images', 'search_videos', 'search_news', 'search_shopping',
      'search_places', 'search_scholar', 'search_patents', 'autocomplete', 'scrape', 'search_many', 'deep_research', 'search_rag_context',
    ]) {
      assert.ok(names.includes(name), `missing tool: ${name}`);
    }
  });

  it('rejects unknown tools', () => {
    assert.throws(() => SearchTools.validateArgs('not_a_tool', {}), /Unknown tool/);
  });

  it('rejects missing required parameters', () => {
    assert.throws(() => SearchTools.validateArgs('search_web', {}), /Missing required parameter: query/);
    assert.throws(() => SearchTools.validateArgs('scrape', {}), /Missing required parameter: url/);
    assert.throws(() => SearchTools.validateArgs('search_many', {}), /Missing required parameter: queries/);
  });

  it('rejects empty / oversized queries', () => {
    assert.throws(() => SearchTools.validateArgs('search_web', { query: '   ' }), /must not be empty/);
    assert.throws(() => SearchTools.validateArgs('search_web', { query: 'x'.repeat(401) }), /400 characters/);
    assert.throws(
      () => SearchTools.validateArgs('search_web', { query: new Array(51).fill('word').join(' ') }),
      /50 words/
    );
  });

  it('validates scrape URLs', () => {
    assert.throws(() => SearchTools.validateArgs('scrape', { url: 'not-a-url' }), /absolute http\(s\) URL/);
    assert.throws(() => SearchTools.validateArgs('scrape', { url: 'ftp://files.example.com' }), /absolute http\(s\) URL/);
    assert.doesNotThrow(() => SearchTools.validateArgs('scrape', { url: 'https://example.com/page' }));
  });

  it('validates the search_many queries array', () => {
    assert.throws(() => SearchTools.validateArgs('search_many', { queries: [] }), /at least 1 query/);
    assert.throws(() => SearchTools.validateArgs('search_many', { queries: new Array(11).fill('q') }), /10 items/);
    assert.throws(() => SearchTools.validateArgs('search_many', { queries: ['ok', ''] }), /non-empty string/);
    assert.throws(() => SearchTools.validateArgs('search_many', { queries: ['ok', 'x'.repeat(401)] }), /400 characters/);
    assert.doesNotThrow(() => SearchTools.validateArgs('search_many', { queries: ['alpha', 'beta'] }));
  });
});
