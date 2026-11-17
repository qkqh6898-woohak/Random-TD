/// <reference types="vite/client" />

/** package.json version (vite.config.ts define) */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** '1'이면 테스트(개발자) 빌드 — `npm run build:single`이 넣는다 (src/devMode.ts) */
  readonly VITE_TEST_BUILD?: string;
}

/** 안드로이드 앱의 자바 다리와 업데이트 결과 받는 곳 (U-1, src/update/UpdateService.ts). 브라우저에는 없다 */
interface Window {
  RandomTDNative?: unknown;
  __rtdUpdate?: (payload: unknown) => void;
  /** 자바가 보내는 짧은 알림 (FB-1: 피드백 주소를 열 브라우저가 없을 때) */
  __rtdToast?: (text: unknown) => void;
}
