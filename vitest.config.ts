import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // sim은 브라우저 없이 돌아야 하므로 기본 환경은 node. DOM이 필요한 테스트만 파일 단위로 따로 지정한다.
    globals: false,
    // 한 테스트 제한 30초 (기본 5초): 리플레이 재생(r3-invisible 40단계 등)은 조용할 때 3~4초인데, 같은 컴퓨터에서 Playwright·다른
    // Vitest가 돌면 5초를 넘겨 시간 초과로 실패했다. 결과(해시·상태)는 그대로 검사하고 느린 컴퓨터만 기다려 준다.
    testTimeout: 30_000,
    reporters: ['default'],
  },
});
