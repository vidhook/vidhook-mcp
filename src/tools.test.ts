import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, type RenderApiClient } from './client.js';
import { registerTools } from './tools.js';

// =============================================================================
// tools 単体テスト（#171）。実 McpServer + 実 Client を InMemoryTransport で結び、
// tools/list と tools/call をフルパスで通す（V1: list/call 疎通）。
//
// 外部境界（render API への HTTP）は RenderApiClient のスタブで遮断する（client.test.ts が
// HTTP→型/エラー正規化を別途担保）。自プロジェクト内（tools の入力組立・content 変換）はモックしない。
// =============================================================================

// テスト用 RenderApiClient スタブ。各メソッドの引数を記録し、戻り値/例外を差し替えられる。
const makeStubClient = (impl: Partial<RenderApiClient>): RenderApiClient => ({
  validate: impl.validate ?? (async () => ({ valid: true, estimatedCredits: 0 })),
  render: impl.render ?? (async () => ({ renderId: 'r', bucketName: 'b', reservedCredits: 0 })),
  getStatus:
    impl.getStatus ??
    (async () => ({
      done: false,
      overallProgress: null,
      outputFile: null,
      fatalErrorEncountered: false,
      errors: [],
    })),
  getUsage:
    impl.getUsage ??
    (async () => ({
      balance: { paidAvailable: 0, freeAvailable: 0, reserved: 0 },
      recentActivity: [],
    })),
});

const connect = async (client: RenderApiClient) => {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerTools(server, client);
  const mcpClient = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  return { server, mcpClient };
};

const validMovie = {
  resolution: 'full-hd',
  fps: 30,
  scenes: [{ duration: 2, elements: [] }],
};

describe('registerTools (full MCP list/call path, V1)', () => {
  let mcpClient: Client;
  let server: McpServer;

  afterEach(async () => {
    await mcpClient?.close();
    await server?.close();
  });

  it('lists exactly the four tools with no API-key input field (V5)', async () => {
    ({ server, mcpClient } = await connect(makeStubClient({})));

    const { tools } = await mcpClient.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['get_status', 'get_usage', 'render', 'validate']);

    // どのツールの inputSchema にも API キー項目が無いこと（V5）。
    for (const tool of tools) {
      const props = Object.keys((tool.inputSchema.properties ?? {}) as object);
      for (const prop of props) {
        expect(prop.toLowerCase()).not.toContain('key');
        expect(prop.toLowerCase()).not.toContain('apikey');
        expect(prop.toLowerCase()).not.toContain('token');
        expect(prop.toLowerCase()).not.toContain('auth');
      }
    }
  });

  it('validate forwards movie+webhook and returns estimate as text + structuredContent', async () => {
    let received: unknown;
    ({ server, mcpClient } = await connect(
      makeStubClient({
        validate: async (body) => {
          received = body;
          return { valid: true, estimatedCredits: 7 };
        },
      }),
    ));

    const result = await mcpClient.callTool({
      name: 'validate',
      arguments: { movie: validMovie, webhook: { url: 'https://example.com/cb' } },
    });

    expect(result.isError).toBeFalsy();
    expect(received).toEqual({ ...validMovie, webhook: { url: 'https://example.com/cb' } });
    expect(result.structuredContent).toEqual({ valid: true, estimatedCredits: 7 });
    expect((result.content as { text: string }[])[0]?.text).toContain('7 credits');
  });

  it('render returns renderId/bucketName/reservedCredits', async () => {
    ({ server, mcpClient } = await connect(
      makeStubClient({
        render: async () => ({ renderId: 'rid', bucketName: 'bkt', reservedCredits: 12 }),
      }),
    ));

    const result = await mcpClient.callTool({ name: 'render', arguments: { movie: validMovie } });

    expect(result.structuredContent).toEqual({
      renderId: 'rid',
      bucketName: 'bkt',
      reservedCredits: 12,
    });
    expect((result.content as { text: string }[])[0]?.text).toContain('rid');
  });

  it('get_status passes renderId/bucketName and summarizes progress', async () => {
    const captured: { renderId?: string; bucketName?: string } = {};
    ({ server, mcpClient } = await connect(
      makeStubClient({
        getStatus: async (renderId, bucketName) => {
          captured.renderId = renderId;
          captured.bucketName = bucketName;
          return {
            done: true,
            overallProgress: 1,
            outputFile: 'https://out/video.mp4',
            fatalErrorEncountered: false,
            errors: [],
          };
        },
      }),
    ));

    const result = await mcpClient.callTool({
      name: 'get_status',
      arguments: { renderId: 'rid', bucketName: 'bkt' },
    });

    expect(captured).toEqual({ renderId: 'rid', bucketName: 'bkt' });
    expect(result.structuredContent).toMatchObject({
      done: true,
      outputFile: 'https://out/video.mp4',
    });
    expect((result.content as { text: string }[])[0]?.text).toContain('done');
  });

  it('get_usage returns balance + recentActivity as text + structuredContent', async () => {
    const usage = {
      balance: { paidAvailable: 1200, freeAvailable: 180, reserved: 5 },
      recentActivity: [
        {
          id: '01J',
          credits: 5,
          bucket: 'paid' as const,
          status: 'succeeded' as const,
          createdAt: '2026-06-30T10:00:00.000Z',
          finalizedAt: '2026-06-30T10:01:30.000Z',
        },
      ],
    };
    ({ server, mcpClient } = await connect(makeStubClient({ getUsage: async () => usage })));

    const result = await mcpClient.callTool({ name: 'get_usage', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(usage);
    const text = (result.content as { text: string }[])[0]?.text ?? '';
    expect(text).toContain('paidAvailable=1200');
    expect(text).toContain('1 entries');
  });

  it.each([
    [400, 'validation', 'invalid_request'],
    [401, 'auth', 'unauthorized'],
    [402, 'insufficient_credits', 'insufficient_credits'],
  ])('surfaces API %i errors as isError text results', async (status, _category, errorCode) => {
    ({ server, mcpClient } = await connect(
      makeStubClient({
        render: async () => {
          throw new ApiError(status, { error: errorCode, detail: 'boom' });
        },
        validate: async () => {
          throw new ApiError(status, { error: errorCode, detail: 'boom' });
        },
      }),
    ));

    const result = await mcpClient.callTool({
      name: status === 402 ? 'render' : 'validate',
      arguments: { movie: validMovie },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0]?.text ?? '';
    expect(text).toContain(String(status));
    expect(text).toContain(errorCode);
  });

  it('rejects get_status calls missing required arguments via the zod inputSchema', async () => {
    ({ server, mcpClient } = await connect(makeStubClient({})));

    // SDK が inputSchema(zod) で引数を検証し、必須欠落は isError の content として返す
    // （handler は呼ばれない）。bucketName 欠落を弾けることを確認する。
    const result = await mcpClient.callTool({
      name: 'get_status',
      arguments: { renderId: 'rid' },
    });

    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]?.text).toContain('bucketName');
  });
});
