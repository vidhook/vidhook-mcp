#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from './client.js';
import { loadConfig } from './config.js';
import { registerTools } from './tools.js';

// =============================================================================
// vidhook-mcp エントリ（#171・PO 確定論点2: transport=stdio のみ）。
//
//   config 読込（VIDHOOK_API_KEY 必須・fail-closed） → McpServer 構築 → 3 ツール登録 →
//   StdioServerTransport で接続。エージェント（MCP クライアント）が本プロセスを子プロセスとして
//   spawn し、stdin/stdout の JSON-RPC で通信する。SSE/HTTP は実装しない。
// =============================================================================

const main = async (): Promise<void> => {
  const config = loadConfig();
  const client = createClient({ apiKey: config.apiKey, baseUrl: config.baseUrl });

  // name/version は MCP initialize で公開される実装名。package.json と揃える（公開時に bump）。
  const server = new McpServer({ name: 'vidhook-mcp', version: '0.1.0' });
  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main().catch((err) => {
  // 起動失敗（API キー欠落等）は stderr へ出して非ゼロ終了する。stdout は JSON-RPC 専用のため使わない。
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
