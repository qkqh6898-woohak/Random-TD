import { defineConfig } from '@playwright/test';

// 구현 에이전트는 5173, 리뷰 에이전트는 E2E_PORT=5181~5189를 쓴다 (CLAUDE.md 5장).
const port = Number(process.env.E2E_PORT ?? 5173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL,
    // 휴대폰 테스트 뷰포트 (CLAUDE.md 1장). 스크린샷은 deviceScaleFactor 1.
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: {
      // 미리 설치된 Chromium을 쓴다. 버전이 어긋나면 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium 지정.
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  projects: [{ name: 'phone-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npx vite --port ${port} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
