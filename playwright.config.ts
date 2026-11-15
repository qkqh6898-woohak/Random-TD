import { defineConfig } from '@playwright/test';

// 구현 에이전트는 5173, 리뷰 에이전트는 E2E_PORT=5181~5189를 쓴다 (CLAUDE.md 5장).
const port = Number(process.env.E2E_PORT ?? 5173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  // 한 테스트 제한 90초 (expect 15초): 헤드리스 Chromium은 1080×1920 캔버스를 소프트웨어로 그려 초당 6~10프레임이고, 같은 컴퓨터에서
  // 다른 작업(다른 Playwright·Vitest)이 돌면 페이지가 몇 초씩 멈추기도 한다. 끌기·연속 클릭처럼 단계가 많은 테스트는 조용할 때도
  // 21~28초라 30초 제한에서는 CPU가 바쁠 때 시간 초과로 실패했다 (m3a 길게 눌러 끌기, m4 일꾼 10명 — 바쁠 때 약 58초).
  // 더 긴 흐름(스크린샷 테스트)은 test.slow()로 3배.
  timeout: 90_000,
  expect: { timeout: 15_000 },
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
