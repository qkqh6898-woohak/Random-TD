/**
 * 그림·JSON 파일 주소 (T-1 한 파일 빌드와 함께).
 *
 * `npm run build:single`로 만든 release/운빨디펜스-test.html 은 `dist-single/assets/**`의 파일을
 * `window.__RTD_ASSETS__`(상대 경로 키 → data URI 또는 JSON 객체)로 품고 있다 — 서버 없이 file://로 열면 상대 주소를 못 읽기 때문.
 * 그림·JSON을 불러오는 코드는 이 함수로 주소를 얻는다: 표에 있으면 그것, 없으면 평소처럼 상대 주소('./assets/…').
 * 지금 게임 그림은 모두 코드로 그려 쓰는 곳이 없고, 그림 파일을 쓰는 작업(assets/characters 등)이 이것을 쓴다.
 */

export type AssetTable = Readonly<Record<string, unknown>>;

/** 'assets/a.webp' · './assets/a.webp' · '/assets/a.webp' → 'assets/a.webp' */
export function assetKey(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\/+/, '');
}

/** 표에서 그림 주소 찾기 (순수). 표에 문자열(data URI)이 있으면 그것, 아니면 './' + 키. */
export function resolveAssetUrl(path: string, table: AssetTable | null | undefined): string {
  const key = assetKey(path);
  const v = table?.[key];
  return typeof v === 'string' ? v : `./${key}`;
}

/** 표에 들어 있는 JSON 객체 (없으면 undefined → 부르는 쪽이 fetch). */
export function embeddedAssetJson(path: string, table: AssetTable | null | undefined): unknown {
  const v = table?.[assetKey(path)];
  return v !== undefined && typeof v !== 'string' ? v : undefined;
}

/** 지금 페이지의 표 (한 파일 빌드가 아니면 null). */
export function currentAssetTable(): AssetTable | null {
  const t = (globalThis as { __RTD_ASSETS__?: unknown }).__RTD_ASSETS__;
  return t && typeof t === 'object' ? (t as AssetTable) : null;
}

/** 그림 등 파일 주소 (한 파일 빌드면 data URI). */
export function assetUrl(path: string): string {
  return resolveAssetUrl(path, currentAssetTable());
}
