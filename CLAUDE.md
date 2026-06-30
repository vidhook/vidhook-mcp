# Guideline

## Top-Level Rules

- Run independent processes concurrently, not sequentially.  
- Think only in English; respond only in Japanese.  
- Use **Context7 MCP** to check library usage.  
- Save temp design notes as `./.tmp/` in Markdown.  
- After **Write/Edit**, always verify with **Read**, even if system says "(no content)".  
- Be critical, not obedient—but stay respectful.

## このリポジトリについて

vidhook.app のエージェント向け **MCP サーバ**（npm: `vidhook-mcp`）の OSS 公開リポジトリ。
render API（`POST /renders/validate` / `POST /renders` / `GET /renders/{id}`）の薄い stdio ラッパで、
`validate` / `render` / `get_status` の 3 ツールと、正しい Movie JSON を書くための Claude skill（`skills/vidhook-movie/`）を同梱する。配布は Claude Code プラグイン（`.claude-plugin/` ＝ plugin + marketplace）で skill と MCP 宣言を 1 回で入れる。

- **スキーマの真実は vidhook API 側**（本リポは再定義しない）。examples の実スキーマ整合は
  `e2e/examples.e2e.test.ts` が実 API を叩いて検証する（`pnpm test:e2e`・要 `VIDHOOK_API_KEY`）。
- ランタイム依存は `@modelcontextprotocol/sdk` と `zod` のみ（自己完結）。
- 公開は npm OIDC Trusted Publishing（`v*` タグ push → `.github/workflows/publish.yml`）。

## コマンド

- `mise run setup` … 依存インストール
- `mise run lint` / `mise run typecheck` / `mise run test` / `mise run build`
- `pnpm test:e2e` … 実 API への疎通テスト（`VIDHOOK_API_KEY` がある時のみ実走）

## Context

- Document System: @docs/document_system.md

## Documents

- Development Philosophy: @docs/development/philosophy.md
- Operations Index: @docs/operations/INDEX.md
