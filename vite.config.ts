import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// 상대 경로(base './')로 빌드해야 Capacitor(파일 경로)와 PWA 하위 경로에서 그대로 동작한다.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // Phaser 자체가 약 1.2MB(압축 전)라 기본 경고 한도(500kB)를 넘는다. 번들 크기는 PROGRESS.md에 기록한다.
    chunkSizeWarningLimit: 1600,
  },
});
