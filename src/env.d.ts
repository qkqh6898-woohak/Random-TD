/// <reference types="vite/client" />

/** package.json version (vite.config.ts define) */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** '1'이면 테스트(개발자) 빌드 — `npm run build:single`이 넣는다 (src/devMode.ts) */
  readonly VITE_TEST_BUILD?: string;
}
