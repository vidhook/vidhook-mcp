import { describe, expect, it, vi } from 'vitest';
import { ApiError, createClient, type RenderRequestBody } from './client.js';

// =============================================================================
// client 単体テスト（#171）。HTTP（fetch）は外部境界としてスタブする。自プロジェクト内（正規化・
// パス構築・ヘッダ付与）はモックしない（philosophy: モックは外部境界のみ）。
// =============================================================================

const baseUrl = 'https://api.example';
const apiKey = 'vh_test_abc123';

// 任意のレスポンスを返す fetch スタブ（外部境界）。リクエスト記録も兼ねる。
const stubFetch = (status: number, body: unknown, contentType = 'application/json') => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, { status, headers: { 'content-type': contentType } });
  }) as unknown as typeof fetch;
  return { fn, calls };
};

const minimalMovie = {} as unknown as RenderRequestBody;

describe('createClient request building (external boundary = fetch stub)', () => {
  it('sends Authorization: Bearer and JSON body to POST /renders/validate', async () => {
    const { fn, calls } = stubFetch(200, { valid: true, estimatedCredits: 2 });
    const client = createClient({ apiKey, baseUrl, fetch: fn });

    const result = await client.validate({ resolution: 'full-hd' } as unknown as RenderRequestBody);

    expect(result).toEqual({ valid: true, estimatedCredits: 2 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.example/renders/validate');
    expect(calls[0]?.init.method).toBe('POST');
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${apiKey}`,
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ resolution: 'full-hd' });
  });

  it('returns the parsed RenderAccepted body for POST /renders', async () => {
    const accepted = { renderId: 'r1', bucketName: 'b1', reservedCredits: 5 };
    const { fn } = stubFetch(202, accepted);
    const client = createClient({ apiKey, baseUrl, fetch: fn });

    expect(await client.render(minimalMovie)).toEqual(accepted);
  });

  it('encodes renderId and bucketName into GET /renders/{id}?bucketName=', async () => {
    const progress = {
      done: false,
      overallProgress: 0.5,
      outputFile: null,
      fatalErrorEncountered: false,
      errors: [],
    };
    const { fn, calls } = stubFetch(200, progress);
    const client = createClient({ apiKey, baseUrl, fetch: fn });

    const result = await client.getStatus('ade2/napmqt', 'bucket name');

    expect(result).toEqual(progress);
    expect(calls[0]?.url).toBe(
      'https://api.example/renders/ade2%2Fnapmqt?bucketName=bucket%20name',
    );
    expect(calls[0]?.init.method).toBe('GET');
  });
});

describe('ApiError normalization', () => {
  it.each([
    [400, 'validation'],
    [401, 'auth'],
    [403, 'auth'],
    [402, 'insufficient_credits'],
    [404, 'not_found'],
    [500, 'other'],
  ])('maps HTTP %i to category %s', async (status, category) => {
    const { fn } = stubFetch(status, { error: 'x', detail: 'y' });
    const client = createClient({ apiKey, baseUrl, fetch: fn });

    await expect(client.render(minimalMovie)).rejects.toMatchObject({
      status,
      category,
    });
  });

  it('includes API error/detail in the message and keeps the body', async () => {
    const { fn } = stubFetch(402, { error: 'insufficient_credits', detail: 'need 10 more' });
    const client = createClient({ apiKey, baseUrl, fetch: fn });

    const err = await client.render(minimalMovie).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toContain('402');
    expect((err as ApiError).message).toContain('insufficient_credits');
    expect((err as ApiError).message).toContain('need 10 more');
    expect((err as ApiError).body).toEqual({
      error: 'insufficient_credits',
      detail: 'need 10 more',
    });
  });

  it('never leaks the API key into the error message or body', async () => {
    const { fn } = stubFetch(401, { error: 'unauthorized' });
    const client = createClient({ apiKey, baseUrl, fetch: fn });

    const err = (await client.validate(minimalMovie).catch((e) => e)) as ApiError;
    expect(err.message).not.toContain(apiKey);
    expect(JSON.stringify(err.body)).not.toContain(apiKey);
  });

  it('falls back to plain text for non-JSON error bodies', async () => {
    const { fn } = stubFetch(502, 'upstream timeout', 'text/plain');
    const client = createClient({ apiKey, baseUrl, fetch: fn });

    const err = (await client.render(minimalMovie).catch((e) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.body).toBe('upstream timeout');
    expect(err.message).toContain('upstream timeout');
  });
});
