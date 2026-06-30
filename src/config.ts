// =============================================================================
// MCP サーバ設定（#171・PO 確定論点3）。API キーと base URL を環境変数からのみ読む。
//
// 2 つの独立した軸（README/ツール説明と整合させる）:
//   - キー種別: VIDHOOK_API_KEY の prefix（vh_test_=free/watermark ↔ vh_live_=paid/clean）。
//     ここでは prefix を解釈せず、そのまま Authorization: Bearer として client へ渡す（解釈は API 側）。
//   - 環境: VIDHOOK_API_BASE_URL（既定 production = https://api.vidhook.app。staging は base URL で切替）。
//
// fail-closed: VIDHOOK_API_KEY 欠落（未設定 or 空）は起動時に明示エラーで停止する。キーをツール引数で
// 受け取る経路は存在しない（環境変数のみ・V5）。
// =============================================================================

export interface Config {
  apiKey: string;
  baseUrl: string;
}

const DEFAULT_BASE_URL = 'https://api.vidhook.app';

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const apiKey = env.VIDHOOK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'VIDHOOK_API_KEY is required. Set it to your vidhook API key ' +
        '(vh_test_… for free/watermark, vh_live_… for paid/clean).',
    );
  }

  // base URL は末尾スラッシュを正規化で除去し、client 側のパス連結を単純化する。
  const baseUrl = (env.VIDHOOK_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');

  return { apiKey, baseUrl };
};
