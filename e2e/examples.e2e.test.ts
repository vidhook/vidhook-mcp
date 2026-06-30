import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createClient } from '../src/client.js';
import { loadConfig } from '../src/config.js';

// =============================================================================
// skill examples の実スキーマ整合ゲート（e2e・実 API /renders/validate）
//
// 各 example を実 render API の validate に投げ、エラーなく estimatedCredits が返ることを検証する。
// これが「examples が実 MovieSchema・クレジット上限に追従しているか」の drift-check（旧 V1/V2）。
// コピーしたスキーマではなく live API（= 真の SSoT）で確認するため、スキーマ変更に自動追従する。
//
// 実行条件: VIDHOOK_API_KEY がある時だけ走る（無い場合は skip）。
//   VIDHOOK_API_KEY=vh_test_... VIDHOOK_API_BASE_URL=https://staging-api.vidhook.app \
//     pnpm test:e2e
// public リポの CI では fork PR に secrets が渡らないため、内部 push 時のみ実行される。
// =============================================================================

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'skill', 'examples');
const exampleFiles = readdirSync(EXAMPLES_DIR).filter((name) => name.endsWith('.json'));

const hasKey = Boolean(process.env.VIDHOOK_API_KEY?.trim());

describe.skipIf(!hasKey)('skill examples validate against the live API', () => {
  const config = loadConfig();
  const client = createClient({ apiKey: config.apiKey, baseUrl: config.baseUrl });

  it.each(exampleFiles)('%s passes /renders/validate within the credit limit', async (name) => {
    const movie = JSON.parse(readFileSync(join(EXAMPLES_DIR, name), 'utf8')) as Record<
      string,
      unknown
    >;

    // 検証で弾かれれば client が ApiError(400) を投げる＝テスト失敗。上限超過も API が 400 で弾く。
    const result = await client.validate(movie);
    expect(result.valid).toBe(true);
    expect(result.estimatedCredits).toBeGreaterThan(0);
  });
});
