import { defineConfig } from 'vitest/config';

// 単一パッケージのテスト設定。unit（src / skill）は `pnpm test`、
// 実 API を叩く e2e（e2e/）は `pnpm test:e2e`（VIDHOOK_API_KEY がある時のみ実走）。
export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
  },
});
