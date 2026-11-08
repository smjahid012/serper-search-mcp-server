/**
 * ResultFormatter tests — web, scholar, scrape rendering.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResultFormatter } from '../dist/utils/ResultFormatter.js';

describe('ResultFormatter', () => {
  it('formats organic web results', () => {
    const text = ResultFormatter.format(
      {
        searchParameters: { q: 'hello world' },
        organic: [{ title: 'Example', link: 'https://example.com', snippet: 'A snippet.' }],
      },
      10,
      'web'
    );
    assert.match(text, /hello world/);
    assert.match(text, /Example/);
    assert.match(text, /https:\/\/example\.com/);
    assert.match(text, /A snippet\./);
  });

  it('formats scholar results with publication info and citations', () => {
    const text = ResultFormatter.format(
      {
        searchParameters: { q: 'attention' },
        organic: [{
          title: 'Attention Is All You Need',
          link: 'https://arxiv.org/abs/1706.03762',
          publicationInfo: 'Vaswani et al., 2017',
          citedBy: 100000,
          snippet: 'The dominant sequence transduction models…',
        }],
      },
      10,
      'scholar'
    );
    assert.match(text, /Scholar/);
    assert.match(text, /Attention Is All You Need/);
    assert.match(text, /Vaswani et al\., 2017/);
    assert.match(text, /cited by 100000/);
  });

  it('shows year fallback and zero citations for scholar', () => {
    const text = ResultFormatter.format(
      {
        searchParameters: { q: 'x' },
        organic: [{ title: 'Paper', link: 'https://x.com', year: 2024, citedBy: 0 }],
      },
      10,
      'scholar'
    );
    assert.match(text, /2024/);
    assert.match(text, /cited by 0/);
  });

  it('prefers markdown in scrape output and truncates long content', () => {
    const long = 'm'.repeat(5000);
    const text = ResultFormatter.formatScrape({ markdown: long, credits: 2 }, 'https://example.com', 1000);
    assert.match(text, /https:\/\/example\.com/);
    assert.match(text, /Truncated to 1[.,]?000 of 5[.,]?000 characters/);
    assert.match(text, /credits used: 2/);
  });

  it('falls back to text when markdown is absent', () => {
    const text = ResultFormatter.formatScrape({ text: 'plain content' }, 'https://example.com');
    assert.match(text, /plain content/);
  });

  it('falls back to a raw JSON dump when no content is returned', () => {
    const text = ResultFormatter.formatScrape({ foo: 'bar' }, 'https://example.com');
    assert.match(text, /Raw response/);
    assert.match(text, /"foo": "bar"/);
  });

  it('handles empty organic results gracefully', () => {
    const text = ResultFormatter.format({ searchParameters: { q: 'nothing' } }, 10, 'web');
    assert.match(text, /No organic results found/);
  });
});
