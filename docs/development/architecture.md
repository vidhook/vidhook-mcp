# アーキテクチャ — vidhook-mcp の設計

`vidhook-mcp` は [vidhook.app](https://vidhook.app) の render API をエージェントから駆動するための **MCP サーバ**。利用方法は [README](../../README.md) を参照。本書は「なぜこの形か」を記録する。

## 位置づけ：render API の薄い stdio ラッパ

vidhook-mcp は **render API（`POST /renders/validate` / `POST /renders` / `GET /renders/{id}`）の薄い HTTP ラッパ**に徹する。新しい契約・スキーマ・レンダラを一切持ち込まない。

- **スキーマの真実（SSoT）は vidhook API 側**（`MovieSchema`）。本リポは Movie を**任意キーの JSON として素通し**し、検証は API に一本化する（`src/client.ts` の `Movie = Record<string, unknown>`）。
- **素材は URL のみ**。vidhook は素材を生成・ホストしない。`src` は呼び出し側が用意した http(s) URL（自前 CDN / 生成系 MCP と組み合わせる）。
- **transport は stdio のみ**（SSE/HTTP は持たない）。MCP クライアントが本プロセスを子プロセスとして spawn し、stdin/stdout の JSON-RPC で通信する。

## MCP = 手足 / skill = 脳

配布は 2 つで役割が異なる:

- **MCP サーバ（手足）**：`validate` / `render` / `get_status` を API に対して実行する。
- **Claude skill（脳・`skills/vidhook-movie/`）**：エージェントに**正しい Movie JSON を書かせる知識**。`SKILL.md`（ワークフロー・キー/環境 2 軸・スキーマ難所）＋ `reference/schema-cheatsheet.md`（全フィールド早見表）＋ `examples/*.json`（代表 4 パターン）。

## 配布：plugin + marketplace（skill と MCP を 1 回で）

skill と MCP は配布経路が異なる。Claude が skill をロードするのは `~/.claude/skills/`・`.claude/skills/`・**プラグインの `skills/<name>/SKILL.md`** のみで、`node_modules/vidhook-mcp/` は対象外。そこで本リポを **Claude Code プラグイン兼 marketplace** とし、1 プラグインに skill + MCP 宣言を同梱する（`/plugin marketplace add` → `/plugin install vidhook@vidhook` の 1 回で脳と手足が両方入る）。

- `.claude-plugin/plugin.json`：プラグイン名 `vidhook`。`mcpServers` を**インライン宣言**（`vidhook` → `npx -y vidhook-mcp`）。API キーは `userConfig.api_key`（`sensitive`・`required`）で**有効化時に入力プロンプト**し、MCP の env へ `${user_config.api_key}` で渡す（マスク入力・keychain 保存、`settings.json` には書かない）。キー必須＝未入力では動かない性質のため、環境変数素通しではなく入力式を採る。root `.mcp.json` は置かない（開発時にこのリポ自身へ誤登録するのを避けるため）。
- `.claude-plugin/marketplace.json`：このリポをカタログ化。plugin source はリポ root（`"./"`）＝同一リポを marketplace として使う。
- **役割分担**：npm パッケージ（`vidhook-mcp`）は **MCP サーバ実体**の配布（`npx` で起動する `dist/`）。プラグインは **skill + MCP 宣言**。よって skill は npm の `files` から外し（`dist` / `README.md` / `LICENSE` のみ公開）、skill の単一ソースをこのリポの `skills/vidhook-movie/` に一本化する。

## 3 ツール

| ツール | 内容 |
|---|---|
| **`validate`（キラー機能）** | レンダを起動せず・クレジットを消費せずに Movie を検証し、`estimatedCredits` を返すドライラン。`render` の予約額と完全一致。原価ゼロで安全に反復できる。 |
| `render` | 非同期レンダを起動。クレジットを予約し `renderId` / `bucketName` / `reservedCredits` を返す。 |
| `get_status` | `renderId` + `bucketName` で進捗をポーリング。`done` かつ非 `fatalErrorEncountered` で `outputFile`（動画 URL）。 |

成功は `structuredContent`（機械可読）+ text 要約、エラーは API の status + 本文を text で返し、エージェントが次手を選べるようにする。

## 設定：環境変数のみ（2 つの独立した軸）

API キーを**ツール引数で受け取る経路は持たない**（`src/config.ts`）。

- **キー種別（`VIDHOOK_API_KEY` の prefix）→ watermark & 課金**：`vh_test_…`=無料枠/watermark（試作）↔ `vh_live_…`=有料/clean（確定）。
- **base URL（`VIDHOOK_API_BASE_URL`）→ 環境**：既定 `https://api.vidhook.app`。watermark の有無には影響しない。
- `VIDHOOK_API_KEY` 欠落（未設定 or 空）は起動時に **fail-closed** で停止する。

## ランタイムは自己完結

実行時依存は **`@modelcontextprotocol/sdk` と `zod` のみ**。vidhook 内部パッケージへ依存しない（モノレポからの独立 OSS 化に伴い、Movie 型はローカル定義へ置換済み）。

ビルドは **tsup**（esm・target node20・bundle で内部モジュールを 1 ファイル化・shebang 保持・実行権限付与）。`bin` は `dist/index.js`。`npx -y vidhook-mcp` で利用できる。

## examples の drift-check 戦略

skill 同梱の `examples/*.json` が陳腐化しないことを 2 層で守る:

- **構造ゲート（unit・`skills/vidhook-movie/examples.test.ts`・依存ゼロ・常時 CI）**：生 JSON だけで確認できる不変条件（`src`=http(s) / 色=hex|transparent / `fps`∈{24,25,30}）。
- **実スキーマ整合（e2e・`e2e/examples.e2e.test.ts`・要 `VIDHOOK_API_KEY`）**：各 example を**実 `POST /renders/validate`** に投げ、エラーなく見積りが返ることを検証する。**コピーしたスキーマではなく live API（= 真の SSoT）に追従**するため、API のスキーマ変更に自動で追従できる。public リポの CI では fork PR に secrets が渡らないため、内部 push / 手元実行時のみ走る。

> この設計により、本リポは vidhook の内部実装を一切持たずに「skill の正しさ」を担保できる。スキーマを写経して二重管理する誘惑（drift の温床）を避けている（[philosophy](./philosophy.md) の DRY / 外部境界の検証）。

## vidhook 本体との関係

- 本リポは **OSS・public**。vidhook 製品本体（API・課金・インフラ）は別の private リポにある。
- 公開境界は **render API の HTTP 契約**のみ。API が変わってもこのラッパの形は基本変わらず、変わるのは skill の知識（examples / cheatsheet）であり、それは e2e の drift-check が検知する。
