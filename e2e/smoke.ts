// =============================================================================
// e2e 疎通スクリプト（#171・V2/V1 証跡用・手動実行）。
//
// 実 render API（ローカル / staging）へ 3 ツール経路（validate → render → get_status）を 1 度叩き、
// リクエスト/レスポンスを記録する。完全モックの単体テストだけで「完了」としないための実環境証跡
// （philosophy: 外部境界の正しさはモックで担保しない）。
//
// 使い方:
//   VIDHOOK_API_KEY=vh_test_... VIDHOOK_API_BASE_URL=https://staging.api.vidhook.app \
//     pnpm exec tsx e2e/smoke.ts
//
//   - キーは vh_test_（無料枠 + watermark）を推奨。環境は base URL で切り替える（キー種別とは独立）。
//   - 機微情報（API キー）は一切出力しない。
// =============================================================================

import { ApiError, createClient } from '../src/client.js';
import { loadConfig } from '../src/config.js';

const sampleMovie = {
  resolution: 'full-hd',
  fps: 30,
  scenes: [
    {
      duration: 2,
      'background-color': '#101010',
      elements: [{ type: 'text', text: 'vidhook MCP smoke test' }],
    },
  ],
};

const log = (label: string, value: unknown): void => {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(value, null, 2));
};

const main = async (): Promise<void> => {
  const config = loadConfig();
  // base URL のみ出す（キーは出さない）。
  console.log(`base URL: ${config.baseUrl}`);
  console.log(`key prefix: ${config.apiKey.slice(0, 8)}…`);

  const client = createClient({ apiKey: config.apiKey, baseUrl: config.baseUrl });

  // 1) validate（見積りのみ・副作用なし）。
  const validation = await client.validate(sampleMovie as never);
  log('validate', validation);

  // 2) render（実起動・クレジット予約）。
  const accepted = await client.render(sampleMovie as never);
  log('render', accepted);

  // 3) get_status（進捗ポーリングを 1 度）。
  const status = await client.getStatus(accepted.renderId, accepted.bucketName);
  log('get_status', status);

  // V4: validate の見積りが render の予約額と一致する。
  console.log(
    `\nV4 estimate(${validation.estimatedCredits}) == reserved(${accepted.reservedCredits}): ` +
      `${validation.estimatedCredits === accepted.reservedCredits}`,
  );
};

main().catch((err) => {
  if (err instanceof ApiError) {
    console.error(`ApiError status=${err.status} category=${err.category}`);
    console.error(JSON.stringify(err.body, null, 2));
  } else {
    console.error(err instanceof Error ? err.message : String(err));
  }
  process.exit(1);
});
