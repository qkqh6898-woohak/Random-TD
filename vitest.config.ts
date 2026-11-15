import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // sim은 브라우저 없이 돌아야 하므로 기본 환경은 node. DOM이 필요한 테스트만 파일 단위로 따로 지정한다.
    globals: false,
    // 리플레이·10만 회 도박처럼 판을 수천 틱 도는 테스트가 있다 — 다른 작업과 CPU를 나눌 때 기본 5초를 넘기지 않게 (T-1)
    testTimeout: 30_000,
    reporters: ['default'],
  },
});
