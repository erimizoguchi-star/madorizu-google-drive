import { defineConfig } from '@playwright/test'

/**
 * 画面を実際に操作して確かめるテスト（e2e/）。
 *
 * - CI（GitHub Actions）: ビルドした本番と同じものを vite preview で立ち上げ、Playwright の Chromium で動かす
 * - 手元: 開発サーバー（npm run dev、5173 番）が動いていればそれを使い、インストール済みの Google Chrome で動かす
 *
 * 実行: npm run test:e2e
 */
const CI = !!process.env.CI

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: CI ? undefined : 'chrome',
    viewport: { width: 1440, height: 900 },
    locale: 'ja-JP',
    acceptDownloads: true,
    trace: CI ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: CI ? 'npm run preview' : 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
})
