/**
 * Logger tests — level filtering over stderr.
 * Run: npm test  (builds first, then runs against dist/)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { logger, setLogLevel, getLogLevel } from '../dist/utils/Logger.js';

describe('Logger', () => {
  beforeEach(() => setLogLevel('info'));

  it('filters messages below the current level', (t) => {
    const spy = t.mock.method(console, 'error', () => {});
    setLogLevel('warn');

    logger.info('hidden');
    logger.debug('hidden');
    assert.equal(spy.mock.callCount(), 0);

    logger.warn('shown');
    logger.error('shown');
    assert.equal(spy.mock.callCount(), 2);
  });

  it('normalizes unknown levels to info', () => {
    setLogLevel('nonsense');
    assert.equal(getLogLevel(), 'info');
  });

  it('silent level suppresses everything', (t) => {
    const spy = t.mock.method(console, 'error', () => {});
    setLogLevel('silent');

    logger.error('x');
    logger.warn('x');
    logger.info('x');
    logger.debug('x');
    assert.equal(spy.mock.callCount(), 0);
  });
});
