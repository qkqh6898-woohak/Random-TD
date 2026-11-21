/**
 * 고용 일꾼 전용 그림: 노란 안전모·파란 멜빵·공구 가방. 전투 타워와 분리.
 * ART-2: main의 HUD는 V2 아이콘 uiIcon('hud-worker')를 쓴다 — 이 초상·대체 SVG는 다른 갈래 호환용으로 남김 (주소는 같은 V2 아이콘).
 */
import { uiArtUrl } from './uiIcons';

export const WORKER_PORTRAIT = uiArtUrl('worker');
export function workerPortraitFallback(event: Event): void {
  const image = event.currentTarget as HTMLImageElement;
  if (image.src !== WORKER_PORTRAIT_FALLBACK) image.src = WORKER_PORTRAIT_FALLBACK;
}
export const WORKER_PORTRAIT_FALLBACK = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72">
<g stroke="#3b2416" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
<ellipse cx="32" cy="68" rx="23" ry="3" fill="#3b2416" opacity=".16" stroke="none"/>
<path d="M18 46 Q10 49 12 59 L20 59 M46 46 Q54 49 51 58 L45 58" fill="#ffcf9f"/>
<path d="M22 60 L21 67 L30 67 L32 59 L35 67 L44 67 L42 59" fill="#65504a"/>
<rect x="19" y="43" width="26" height="19" rx="8" fill="#64bfc8"/>
<path d="M24 44 L24 56 L40 56 L40 44" fill="#3687ad"/>
<rect x="28" y="51" width="9" height="7" rx="2" fill="#d9f4e6"/>
<rect x="44" y="53" width="13" height="12" rx="3" fill="#e7ac61"/>
<path d="M47 53 L47 49 L54 49 L54 53" fill="none"/>
<ellipse cx="32" cy="30" rx="22" ry="20" fill="#ffdcaf"/>
<path d="M11 25 Q11 6 32 6 Q53 6 53 25" fill="#ffd15e"/>
<rect x="7" y="22" width="50" height="7" rx="3.5" fill="#ffb747"/>
<path d="M29 7 L29 20 L36 20 L36 7" fill="#ffe79c"/>
<ellipse cx="23" cy="35" rx="2.7" ry="3.7" fill="#3b2416" stroke="none"/>
<ellipse cx="41" cy="35" rx="2.7" ry="3.7" fill="#3b2416" stroke="none"/>
<path d="M28 41 Q32 45 36 41" fill="none"/>
<ellipse cx="17" cy="40" rx="4" ry="2.3" fill="#f4a7a0" stroke="none"/>
<ellipse cx="47" cy="40" rx="4" ry="2.3" fill="#f4a7a0" stroke="none"/>
</g></svg>`)}`;
