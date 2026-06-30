// =============================================================================
// render API への薄い HTTP クライアント（外部境界 1 箇所集約）。
//
// MCP は既存 render API の薄い HTTP ラッパに徹する。レンダラ・API 契約・スキーマは不変で、
// この client が API との唯一の通信境界（fetch）。全リクエストに Authorization: Bearer を付ける。
//
// Movie の構造は vidhook API の MovieSchema が唯一の真実（SSoT）。本リポは render API の
// 公開契約に対する薄いクライアントであり、スキーマを再定義しない。エージェントから受けた Movie は
// そのまま転送し、検証は API 側に一本化する。よって body は任意キーの JSON オブジェクトとして扱う。
// レスポンス型は API の OpenAPI 契約（Render* スキーマ）を反映して併置する。
// zod / MCP SDK はここに混入させず、純粋な型と fetch のみで構成する。
// =============================================================================

// Movie 定義。構造の真実は API 側 MovieSchema にあるため、ここでは任意キーの JSON として受ける
// （examples の実スキーマ整合は e2e/examples.e2e.test.ts が実 API で検証する）。
export type Movie = Record<string, unknown>;

// POST /renders リクエスト body = Movie + 任意の webhook（同階層併置）。
export interface RenderWebhook {
  url: string;
  secret?: string;
}

export type RenderRequestBody = Movie & { webhook?: RenderWebhook };

// POST /renders/validate レスポンス（openapi.ts RenderValidationResult）。
export interface RenderValidationResult {
  valid: true;
  estimatedCredits: number;
}

// POST /renders レスポンス（openapi.ts RenderAccepted）。
export interface RenderAccepted {
  renderId: string;
  bucketName: string;
  reservedCredits: number;
}

// GET /renders/{renderId} レスポンス（openapi.ts RenderProgress）。
export interface RenderProgress {
  done: boolean;
  overallProgress: number | null;
  outputFile: string | null;
  fatalErrorEncountered: boolean;
  errors: unknown[];
}

// 非 2xx を正規化したエラー。status と API が返した本文（error/detail）を保持する。
// 機微情報（API キー等）は一切含めない（V5）。category はエージェント向けの粗い分類。
export type ApiErrorCategory =
  | 'validation'
  | 'auth'
  | 'insufficient_credits'
  | 'not_found'
  | 'other';

export class ApiError extends Error {
  readonly status: number;
  readonly category: ApiErrorCategory;
  // API が返した JSON 本文（{ error, detail } 等）。パース不能時は素のテキスト。
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(formatApiErrorMessage(status, body));
    this.name = 'ApiError';
    this.status = status;
    this.category = categorize(status);
    this.body = body;
  }
}

// HTTP status → エージェント向けの粗い分類。
//   400 = 検証/上限超過 / 401・403 = 認証 / 402 = 残高不足 / 404 = 不存在 / その他。
const categorize = (status: number): ApiErrorCategory => {
  if (status === 400) return 'validation';
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'insufficient_credits';
  if (status === 404) return 'not_found';
  return 'other';
};

const formatApiErrorMessage = (status: number, body: unknown): string => {
  if (body && typeof body === 'object') {
    const { error, detail } = body as { error?: unknown; detail?: unknown };
    const parts = [error, detail].filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (parts.length > 0) {
      return `vidhook API error (${status}): ${parts.join(' — ')}`;
    }
  }
  if (typeof body === 'string' && body.length > 0) {
    return `vidhook API error (${status}): ${body}`;
  }
  return `vidhook API error (${status})`;
};

export interface ClientOptions {
  apiKey: string;
  baseUrl: string;
  // テスト（外部境界スタブ）用に fetch を差し替え可能にする。既定は global fetch。
  fetch?: typeof fetch;
}

export interface RenderApiClient {
  validate(body: RenderRequestBody): Promise<RenderValidationResult>;
  render(body: RenderRequestBody): Promise<RenderAccepted>;
  getStatus(renderId: string, bucketName: string): Promise<RenderProgress>;
}

export const createClient = (options: ClientOptions): RenderApiClient => {
  const { apiKey, baseUrl } = options;
  const fetchImpl = options.fetch ?? fetch;

  // 共通リクエスト。Authorization: Bearer を必ず付け、非 2xx を ApiError へ正規化する。
  const request = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const text = await res.text();
    const parsed = parseJson(text);

    if (!res.ok) {
      throw new ApiError(res.status, parsed);
    }
    return parsed as T;
  };

  return {
    validate: (body) => request<RenderValidationResult>('POST', '/renders/validate', body),
    render: (body) => request<RenderAccepted>('POST', '/renders', body),
    getStatus: (renderId, bucketName) =>
      request<RenderProgress>(
        'GET',
        `/renders/${encodeURIComponent(renderId)}?bucketName=${encodeURIComponent(bucketName)}`,
      ),
  };
};

// レスポンス本文を JSON として読む。空 or 非 JSON は素のテキストへフォールバックする
// （エラー本文が text/plain で返るケースの取りこぼし防止）。
const parseJson = (text: string): unknown => {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
