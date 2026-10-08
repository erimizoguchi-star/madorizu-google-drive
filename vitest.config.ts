import { defineConfig } from 'vitest/config'

// 単体テストは src のみ。画面を操作するテスト（e2e/）は Playwright で動かす
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
