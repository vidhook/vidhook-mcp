import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ApiError, type RenderApiClient, type RenderRequestBody } from './client.js';

// =============================================================================
// MCP の 3 ツール（#171）。validate / render / get_status を render API の薄いラッパとして登録する。
//
// 設計方針:
//   - MCP は検証も見積りもせず、render API へ素通しする（検証/見積りの真実の源は API 側）。
//     よって validate/render の inputSchema は Movie 構造を再定義せず、JSON オブジェクトとして受ける。
//     不正な Movie は API が 400 で返し、その本文をそのままエージェントへ戻す。
//   - 素材は URL のみ受け付ける（生成系はエージェント側で合成）。Movie の各 element の src は URL。
//   - API キーは環境変数（VIDHOOK_API_KEY）のみ。ツール inputSchema にキー項目を絶対に含めない（V5）。
//   - 成功は structuredContent（機械可読）+ text 要約（人間可読）で返す。エラー（ApiError）は
//     status + 本文を text で返し、エージェントが次の手を選べるようにする。
// =============================================================================

// validate/render が受ける Movie body。MovieSchema の再定義は避け（SSoT は API 側）、
// 任意キーを持つ JSON オブジェクトとして受ける。webhook（完了通知先）は API と同一の任意フィールド。
const webhookSchema = z
  .object({
    url: z.string().url().describe('HTTPS endpoint vidhook POSTs a completion event to.'),
    secret: z
      .string()
      .min(1)
      .optional()
      .describe('Optional signing secret. When set, the completion request is HMAC-signed.'),
  })
  .describe('Optional completion-notification webhook (alongside the Movie fields).');

// Movie 本体は API が検証するため、ここでは passthrough なオブジェクトとして受ける。
// inputSchema は SDK へ渡す raw zod shape（z.object でラップしない）。
const movieInputShape = {
  movie: z
    .record(z.unknown())
    .describe(
      'Movie definition (json2video-compatible). resolution/scenes/elements etc. ' +
        'All asset references (video/image/audio src) must be URLs — vidhook does not generate ' +
        'assets; compose them on the agent side. Validated by the vidhook API.',
    ),
  webhook: webhookSchema.optional(),
} as const;

const getStatusInputShape = {
  renderId: z.string().min(1).describe('The render id returned by the render tool.'),
  bucketName: z
    .string()
    .min(1)
    .describe('The bucketName returned by the render tool (alongside renderId).'),
} as const;

// validate/render の input（movie + 任意 webhook）を API の request body へ組み立てる。
const toRequestBody = (input: {
  movie: Record<string, unknown>;
  webhook?: { url: string; secret?: string };
}): RenderRequestBody =>
  ({
    ...input.movie,
    ...(input.webhook ? { webhook: input.webhook } : {}),
  }) as RenderRequestBody;

// 成功は structuredContent + text、エラーは isError + text。型は SDK の CallToolResult に揃える。
const ok = (summary: string, structured: Record<string, unknown>): CallToolResult => ({
  content: [{ type: 'text', text: summary }],
  structuredContent: structured,
});

// ApiError をエージェント向けの text へ正規化する。category で次の手の手がかりを与える。
// 機微情報は ApiError に含まれない（client が status + 本文のみを保持・V5）。
const toErrorResult = (err: unknown): CallToolResult => {
  if (err instanceof ApiError) {
    const detail =
      err.body && typeof err.body === 'object' ? JSON.stringify(err.body) : String(err.body ?? '');
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `${err.message}${detail ? `\n${detail}` : ''}`,
        },
      ],
    };
  }
  return {
    isError: true,
    content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
  };
};

// API キー軸（watermark）と環境軸（base URL）の独立性を案内する共通文言（README と整合・PO 論点3）。
const KEY_AND_ENV_NOTE =
  'Authentication and watermarking are set by the VIDHOOK_API_KEY environment variable only ' +
  '(never a tool argument): vh_test_… renders a free/watermarked draft, vh_live_… renders clean/paid. ' +
  'The target environment is selected independently by VIDHOOK_API_BASE_URL (base URL), not by the key type.';

// 3 ツールを McpServer へ登録する。client は外部境界（HTTP）の唯一の依存として注入する。
export const registerTools = (server: McpServer, client: RenderApiClient): void => {
  server.registerTool(
    'validate',
    {
      title: 'Validate a render and estimate credits',
      description:
        'Validate a Movie definition (and optional webhook) WITHOUT starting a render or ' +
        'consuming any credits, and return the estimated credit cost. Use this to preview cost ' +
        'and catch errors before calling render. estimatedCredits equals the credits render would ' +
        'reserve for the same body. Invalid Movies or SSRF-rejected webhook URLs are returned as ' +
        `errors (HTTP 400) from the API. ${KEY_AND_ENV_NOTE}`,
      inputSchema: movieInputShape,
    },
    async (input) => {
      try {
        const result = await client.validate(toRequestBody(input));
        return ok(
          `Valid. Estimated cost: ${result.estimatedCredits} credits ` +
            '(no render started, no credits consumed).',
          { ...result },
        );
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  server.registerTool(
    'render',
    {
      title: 'Start a render',
      description:
        'Submit a Movie definition (and optional webhook) and start an asynchronous render. ' +
        'Reserves credits and returns renderId, bucketName, and reservedCredits. Poll progress ' +
        'with get_status using the returned renderId and bucketName. All asset references must be ' +
        'URLs (vidhook does not generate assets). Insufficient credits return an error (HTTP 402). ' +
        `${KEY_AND_ENV_NOTE}`,
      inputSchema: movieInputShape,
    },
    async (input) => {
      try {
        const result = await client.render(toRequestBody(input));
        return ok(
          `Render started. renderId=${result.renderId}, bucketName=${result.bucketName}, ` +
            `reservedCredits=${result.reservedCredits}. Poll get_status with renderId and bucketName.`,
          { ...result },
        );
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  server.registerTool(
    'get_status',
    {
      title: 'Get render status',
      description:
        'Poll the progress of a render started with the render tool. When done is true and ' +
        'fatalErrorEncountered is false, outputFile holds the result video URL. Pass the renderId ' +
        'and bucketName returned by render.',
      inputSchema: getStatusInputShape,
    },
    async ({ renderId, bucketName }) => {
      try {
        const result = await client.getStatus(renderId, bucketName);
        const progressPct =
          result.overallProgress === null
            ? 'unknown'
            : `${Math.round(result.overallProgress * 100)}%`;
        const summary = result.done
          ? result.fatalErrorEncountered
            ? `Render ${renderId} failed.`
            : `Render ${renderId} done. outputFile=${result.outputFile ?? 'unavailable'}.`
          : `Render ${renderId} in progress (${progressPct}).`;
        return ok(summary, { ...result });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
};
