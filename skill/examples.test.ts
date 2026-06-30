import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// =============================================================================
// skill 同梱 examples の構造ゲート（unit・依存ゼロ・CI 既定で常時実行）
//
// 生 JSON だけで機械確認できる不変条件を回帰ガードする:
//   - src は http(s) のみ（vidhook は素材を生成せず URL のみ受ける）
//   - 色（background-color / font-color）は hex / transparent のみ
//   - fps は {24,25,30} のみ
//
// 実 MovieSchema との整合（parseMovie を通る・クレジット上限内）は、コピーしたスキーマではなく
// 実 API で検証する方が確実なため e2e/examples.e2e.test.ts（実 /renders/validate）に委ねる。
// これにより本リポは vidhook 内部パッケージへ依存せず自己完結する。
// =============================================================================

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'examples');

const exampleFiles = readdirSync(EXAMPLES_DIR).filter((name) => name.endsWith('.json'));

const ALLOWED_FPS = new Set([24, 25, 30]);
const HEX_OR_TRANSPARENT = /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|transparent)$/;

// 生 JSON から、検証用にプリミティブ（string / number）をキー別に再帰収集する。
const collect = (value: unknown, key: string, acc: Map<string, unknown[]>): void => {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, key, acc);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collect(v, k, acc);
    return;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const list = acc.get(key) ?? [];
    list.push(value);
    acc.set(key, list);
  }
};

describe('skill examples (structural)', () => {
  it('ships at least one example', () => {
    expect(exampleFiles.length).toBeGreaterThan(0);
  });

  it.each(exampleFiles)('%s: src=http(s), colors=hex, fps∈{24,25,30}', (name) => {
    const json = JSON.parse(readFileSync(join(EXAMPLES_DIR, name), 'utf8')) as Record<
      string,
      unknown
    >;

    const byKey = new Map<string, unknown[]>();
    collect(json, '', byKey);

    for (const src of byKey.get('src') ?? []) {
      expect(typeof src).toBe('string');
      expect(src as string).toMatch(/^https?:\/\//);
    }
    for (const colorKey of ['background-color', 'font-color']) {
      for (const color of byKey.get(colorKey) ?? []) {
        expect(color as string).toMatch(HEX_OR_TRANSPARENT);
      }
    }
    for (const fps of byKey.get('fps') ?? []) {
      expect(ALLOWED_FPS.has(fps as number)).toBe(true);
    }
  });
});
