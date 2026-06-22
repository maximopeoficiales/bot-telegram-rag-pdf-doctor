import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../../src/config/env.js';

/**
 * Build a minimal valid env that satisfies all required fields
 * except the ones the individual test is exercising.
 */
function baseEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/testdb',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_STAFF_GROUP_CHAT_ID: '-100000001',
    // Provide Gemini key so gemini-provider tests can opt out individually
    GEMINI_API_KEY: 'test-gemini-key',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/oauth/callback',
    GOOGLE_REFRESH_TOKEN: 'google-refresh-token',
    ...overrides
  };
}

describe('loadEnv — AI_PROVIDER', () => {
  it('defaults to "ollama" when AI_PROVIDER is not set', () => {
    const env = loadEnv(baseEnv({ AI_PROVIDER: undefined as unknown as string }));
    expect(env.AI_PROVIDER).toBe('ollama');
  });

  it('accepts "gemini" as a valid AI_PROVIDER value', () => {
    const env = loadEnv(baseEnv({ AI_PROVIDER: 'gemini' }));
    expect(env.AI_PROVIDER).toBe('gemini');
  });

  it('accepts "ollama" as a valid AI_PROVIDER value', () => {
    const env = loadEnv(baseEnv({ AI_PROVIDER: 'ollama' }));
    expect(env.AI_PROVIDER).toBe('ollama');
  });

  it('rejects an unknown AI_PROVIDER value', () => {
    expect(() =>
      loadEnv(baseEnv({ AI_PROVIDER: 'openai' }))
    ).toThrow();
  });
});

describe('loadEnv — GEMINI_API_KEY conditional requirement', () => {
  it('throws when AI_PROVIDER=gemini and GEMINI_API_KEY is missing', () => {
    expect(() =>
      loadEnv(baseEnv({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: '' }))
    ).toThrow(/GEMINI_API_KEY/);
  });

  it('throws when AI_PROVIDER=gemini and GEMINI_API_KEY is whitespace only', () => {
    expect(() =>
      loadEnv(baseEnv({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: '   ' }))
    ).toThrow(/GEMINI_API_KEY/);
  });

  it('succeeds when AI_PROVIDER=gemini and GEMINI_API_KEY is provided', () => {
    const env = loadEnv(baseEnv({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'my-key' }));
    expect(env.GEMINI_API_KEY).toBe('my-key');
  });

  it('allows missing GEMINI_API_KEY when AI_PROVIDER=ollama', () => {
    const env = loadEnv(baseEnv({ AI_PROVIDER: 'ollama', GEMINI_API_KEY: '' }));
    expect(env.GEMINI_API_KEY).toBe('');
  });

  it('allows absent GEMINI_API_KEY when AI_PROVIDER=ollama', () => {
    const source = baseEnv({ AI_PROVIDER: 'ollama' });
    delete source['GEMINI_API_KEY'];
    const env = loadEnv(source);
    expect(env.GEMINI_API_KEY).toBe('');
  });
});

describe('loadEnv — OLLAMA_BASE_URL default', () => {
  it('provides a sensible default for OLLAMA_BASE_URL when not set', () => {
    const source = baseEnv({ AI_PROVIDER: 'ollama' });
    delete source['OLLAMA_BASE_URL'];
    const env = loadEnv(source);
    expect(env.OLLAMA_BASE_URL).toMatch(/^https?:\/\//);
    expect(env.OLLAMA_BASE_URL).toBeTruthy();
  });

  it('accepts a custom OLLAMA_BASE_URL', () => {
    const env = loadEnv(baseEnv({ AI_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'http://localhost:11434' }));
    expect(env.OLLAMA_BASE_URL).toBe('http://localhost:11434');
  });
});
