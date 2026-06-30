import { defineConfig } from 'tsup';

// =============================================================================
// 公開用ビルド。bin の実体を TS ソースから `dist/index.js` へ。
//
//   - format=esm（package は type:module）/ target=node20（利用者の Node 下限に合わせる）。
//   - bundle=true: 内部モジュール（client/config/tools）を 1 ファイルに同梱し、
//     ./*.js 拡張子の解決問題を回避する。dependencies（@modelcontextprotocol/sdk・zod）は
//     tsup が自動で external 化＝バンドルせず利用者の install に委ねる。
//   - 本リポは vidhook 内部パッケージへ依存しない（Movie は client.ts のローカル型）。
//   - shebang（#!/usr/bin/env node）は tsup が保持し、出力に実行権限を付与する。
//   - dts は不要（CLI bin であってライブラリではない）。
// =============================================================================
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  dts: false,
  sourcemap: false,
  minify: false,
});
