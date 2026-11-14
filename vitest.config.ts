import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // sim은 브라우저 없이 돌아야 하므로 기본 환경은 node. DOM이 필요한 테스트만 파일 단위로 따로 지정한다.
    globals: false,
    reporters: ['default'],
  },
});
