# リリース Runbook — npm 公開（OIDC Trusted Publishing）

`vidhook-mcp` は npm へ **OIDC Trusted Publishing** で公開する。**`NPM_TOKEN` を保存しない**（長期トークンのローテーション不要）。ワークフローは `.github/workflows/publish.yml`。

## 仕組み

GitHub Actions が発行する OIDC トークンを npm レジストリが検証し、「この repo の このワークフローからの publish」を信頼する。トークンは保存せず、実行時にのみ発行される。公開物には **provenance（SLSA）attestation** が自動付与され、公開ソースに紐づく署名証明になる。

要件（`publish.yml` が満たす）:
- `permissions: id-token: write`（OIDC トークン発行）。
- **npm CLI >= 11.5.1 / Node >= 22.14**（`actions/setup-node@v6` + `npm i -g npm@latest` で保証）。
- `actions/setup-node` の **`registry-url: https://registry.npmjs.org`**（npm に対象レジストリを明示。無いと OIDC が起動せず `ENEEDAUTH` になる）。
- **`NODE_AUTH_TOKEN` を設定しない**（設定すると npm がトークン認証を試み OIDC が無効化される）。
- **GitHub ホストランナー**（self-hosted は非対応）。

## 一度だけ：Trusted Publisher の登録

npmjs.com → パッケージ `vidhook-mcp` → **Settings → Trusted Publisher** に以下を**完全一致**で登録する（全フィールド case-sensitive）。

| フィールド | 値 |
|---|---|
| Provider | GitHub Actions |
| Organization or user | **`vidhook`** |
| Repository | **`vidhook-mcp`** |
| Workflow filename | **`publish.yml`**（拡張子込み・パスなし） |
| Environment | **空欄** |

> ⚠️ ここの不一致が公開失敗の最頻原因。`ENEEDAUTH`（OIDC が起動しない）や `E404 「could not be found or you do not have permission」`（OIDC は起動したが trusted publisher 不一致で拒否）として現れる。初回公開（0.1.1）では **Organization に個人名 `douhashi` を入れていて E404** になった実績がある（正: `vidhook`）。
>
> 補足: OIDC の照合は **パッケージが npm 上に既に存在する**ことが前提（新規パッケージは初回だけ手動公開が必要）。`vidhook-mcp` の最初の publish（0.1.0）はモノレポから手動で行った。

## 通常のリリース手順

```bash
# 1. version を上げる（package.json の "version" を編集）→ commit → main へマージ
# 2. タグを打って push（タグ名は v<version> と一致必須）
git tag v0.2.0 && git push origin v0.2.0
```

タグ push → `publish.yml` 起動 → タグ版と `package.json` version の一致を検証 → `lint` / `typecheck` / `test` / `build` → `npm publish --access public`（OIDC）。

- **手動再実行**：`gh workflow run publish.yml --ref main`（`workflow_dispatch`）。タグ版チェックはスキップし、`package.json` の version を公開する。公開失敗後の再試行に便利。
- 公開済みバージョンは再公開できない（immutable）。失敗時は version を上げ直すか、未公開なら同じ version で再実行してよい。

## 公開後の確認

```bash
npm view vidhook-mcp version dist-tags.latest repository.url
npm view vidhook-mcp dist.attestations   # provenance が付いていること
```

## トラブルシュート

| 症状 | 原因 / 対処 |
|---|---|
| `npm error code ENEEDAUTH` | OIDC が起動していない。`registry-url` 未設定 / npm < 11.5.1 / `id-token: write` 欠落を確認。 |
| `npm error 404 ... do not have permission` | OIDC は起動したが **Trusted Publisher 設定が不一致**。上表（特に Organization=`vidhook`・workflow=`publish.yml`・Environment 空欄）を再確認。 |
| `npm error code E403 ... PUT /<pkg>`（provenance 署名は成功するのに PUT だけ 403・`forbidden by your security policy`） | **npm の spam/abuse 検知**。詳細メッセージは `Package name triggered spam detection; ... contact support at https://npmjs.com/support` で確認できる（CLI 要約では汎用文言に丸められることがある）。0.2.0 リリース時、README 本文が spam 判定され publish が全経路（local OTP / OIDC）で 403 になった実績あり。切り分け: 同名パッケージで最小 README なら通過し、フル README で 403 → **README コンテンツが原因**（反復した設定ブロック等が疑わしい）。対処: README を簡潔化して反復を除去する / それでも弾かれるなら `npmjs.com/support` に false positive を申告。なお短時間に多数のパッケージを publish 試行するとレート/名前側の spam 検知も発火するので注意。OIDC 認証・2FA・mfa 設定はいずれも無関係（OIDC 交換は 201 で成功する）。 |
| `bin script name ... was invalid and removed` | `bin` 値の正規化警告。`package.json` の `bin` を `dist/index.js`（先頭 `./` なし）にすれば出ない。 |
