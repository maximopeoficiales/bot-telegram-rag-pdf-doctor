import { describe, expect, it, vi } from 'vitest';
import { OllamaAdapter } from '../../../src/adapters/ollama/ollama.adapter.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}

describe('OllamaAdapter', () => {
  it('generates Spanish QA answers through /api/generate', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ response: 'Respuesta desde Ollama' }));
    const adapter = new OllamaAdapter({ baseUrl: 'http://ollama:11434', fetch: fetchMock as typeof fetch });

    const answer = await adapter.answer({ question: '¿Atienden en Surco?', context: ['Atendemos en Surco.'] });

    expect(answer).toBe('Respuesta desde Ollama');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ollama:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('qwen2.5:7b')
      })
    );
  });

  it('embeds chunks one by one and parses /api/embed embeddings', async () => {
    const embedding = Array(768).fill(0.2);
    const fetchMock = vi.fn(async () => jsonResponse({ embeddings: [embedding] }));
    const adapter = new OllamaAdapter({ baseUrl: 'http://ollama:11434', fetch: fetchMock as typeof fetch });

    const result = await adapter.embedChunks(['uno', 'dos']);

    expect(result).toEqual([embedding, embedding]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls as unknown[][])[0]?.[0]).toBe('http://ollama:11434/api/embed');
  });

  it('falls back to /api/embeddings when /api/embed is unavailable', async () => {
    const embedding = Array(768).fill(0.3);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, false, 404))
      .mockResolvedValueOnce(jsonResponse({ embedding }));
    const adapter = new OllamaAdapter({ baseUrl: 'http://ollama:11434', fetch: fetchMock as typeof fetch });

    await expect(adapter.embedQuery('consulta')).resolves.toEqual(embedding);
    expect((fetchMock.mock.calls as unknown[][]).map(([url]) => url)).toEqual([
      'http://ollama:11434/api/embed',
      'http://ollama:11434/api/embeddings'
    ]);
  });

  it('returns safe fallbacks for malformed JSON model output', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ response: 'no es json' }));
    const adapter = new OllamaAdapter({ fetch: fetchMock as typeof fetch });

    await expect(adapter.extractRules({ title: 'Reglas', content: 'Texto' })).resolves.toEqual([]);
    await expect(adapter.extractSchedule('texto sin horario')).resolves.toBeNull();
  });

  it('rejects extracted schedule windows with invalid or reversed times', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      response: JSON.stringify({
        surco: { start: '99:99', end: '10:00' },
        vmt: { start: '20:00', end: '18:00' }
      })
    }));
    const adapter = new OllamaAdapter({ fetch: fetchMock as typeof fetch });

    await expect(adapter.extractSchedule('horarios inválidos')).resolves.toBeNull();
  });

  it('passes an abort signal to Ollama HTTP requests for explicit timeout handling', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return jsonResponse({ response: 'Respuesta desde Ollama' });
    });
    const adapter = new OllamaAdapter({ fetch: fetchMock as typeof fetch, timeoutMs: 1_000 });

    await expect(adapter.answer({ question: '¿Atienden?', context: ['Sí.'] })).resolves.toBe('Respuesta desde Ollama');
  });

  it('throws a timeout error when the Ollama request is aborted by the controller', async () => {
    // Simulate fetch rejecting with a DOMException abort error, exactly as
    // happens when AbortController.abort() fires during a real network call.
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    const fetchMock = vi.fn().mockImplementation(
      async (_url: string | URL | Request, _init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          reject(abortError);
        });
      }
    );

    const adapter = new OllamaAdapter({
      fetch: fetchMock as typeof fetch,
      timeoutMs: 1
    });

    // Use embedQuery because it does not have a catch-all fallback —
    // errors propagate directly to the caller.
    await expect(
      adapter.embedQuery('test query')
    ).rejects.toThrow(/timeout|aborted/i);
  });

  it('does not include raw response body in error message when server returns non-OK status', async () => {
    const sensitiveBody = 'patient-data: John Doe, diagnosis: confidential';
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => sensitiveBody
    } as Response));
    const adapter = new OllamaAdapter({ baseUrl: 'http://ollama:11434', fetch: fetchMock as typeof fetch });

    // Use embedQuery — no catch-all fallback, so the error propagates directly.
    await expect(adapter.embedQuery('test')).rejects.toSatisfy(
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        // Must mention status code for debuggability
        expect(msg).toContain('503');
        // Must NOT leak raw body content
        expect(msg).not.toContain(sensitiveBody);
        return true;
      }
    );
  });
});
