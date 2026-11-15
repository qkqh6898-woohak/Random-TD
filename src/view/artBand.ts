/**
 * 전투 배경 고르기 (HF-2, 순수 — Phaser·DOM 없음 → 단위 테스트).
 *
 * 타이틀 그림 고르기(pickTitleArt)도 여기 (순수).
 *
 * 배경 그림 = `public/assets/backgrounds/bg_tTT_bB.webp` (테마 1~10 × 하늘 밴드 1~5: 낮·노을·밤·전운·침공 절정).
 * 설정은 game.json `art` (bandStages 10, bands 5, infiniteThemeStages 50, themes 10):
 *  - 캠페인: 테마 = 캠페인 테마, 밴드 = clamp(floor((단계-1)/bandStages)+1, 1, bands)
 *  - 무한:   테마 = (floor((단계-1)/infiniteThemeStages) mod themes)+1, 밴드 = floor(((단계-1) mod infiniteThemeStages)/bandStages)+1
 * 준비 시간(0단계)은 1단계와 같은 배경.
 */
import type { ArtConfig } from '../data/load';
import type { MatchMode } from '../sim/state';

export type BandConfig = Pick<ArtConfig, 'bandStages' | 'bands' | 'infiniteThemeStages' | 'themes'>;

export interface BandKey {
  /** 1부터 */
  theme: number;
  /** 1부터 */
  band: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 그 단계의 배경 (테마·밴드). */
export function backgroundBand(cfg: BandConfig, mode: MatchMode, stage: number, campaignTheme: number): BandKey {
  const s = Math.max(1, Math.floor(stage)) - 1;
  if (mode === 'campaign') {
    return {
      theme: clamp(Math.floor(campaignTheme) || 1, 1, cfg.themes),
      band: clamp(Math.floor(s / cfg.bandStages) + 1, 1, cfg.bands),
    };
  }
  return {
    theme: (Math.floor(s / cfg.infiniteThemeStages) % cfg.themes) + 1,
    band: clamp(Math.floor((s % cfg.infiniteThemeStages) / cfg.bandStages) + 1, 1, cfg.bands),
  };
}

/**
 * 미리 받아 둘 다음 배경: preloadStages단계 뒤의 배경이 지금과 다르면 그것, 같으면 null.
 * (밴드가 끝나기 직전에 받아 두면 바뀌는 순간 바로 서서히 바뀐다)
 */
export function upcomingBand(cfg: BandConfig & { preloadStages: number }, mode: MatchMode, stage: number, campaignTheme: number): BandKey | null {
  if (cfg.preloadStages <= 0) return null;
  const now = backgroundBand(cfg, mode, stage, campaignTheme);
  const next = backgroundBand(cfg, mode, Math.max(1, stage) + cfg.preloadStages, campaignTheme);
  return sameBand(now, next) ? null : next;
}

export function sameBand(a: BandKey | null, b: BandKey | null): boolean {
  return a !== null && b !== null && a.theme === b.theme && a.band === b.band;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 배경 그림 파일 주소 (assetUrl에 넘길 상대 경로). */
export function backgroundPath(k: BandKey): string {
  return `assets/backgrounds/bg_t${pad2(k.theme)}_b${k.band}.webp`;
}

/** Phaser 텍스처 키. */
export function backgroundTextureKey(k: BandKey): string {
  return `bg-t${pad2(k.theme)}-b${k.band}`;
}

/** 덮기(cover) 배율: 그림이 w×h 화면을 빈틈없이 덮는 가장 작은 배율 (넘치는 쪽은 가운데 기준으로 잘림). */
export function coverScale(imgW: number, imgH: number, w: number, h: number): number {
  if (!(imgW > 0) || !(imgH > 0)) return 1;
  return Math.max(w / imgW, h / imgH);
}

/** 타이틀 그림 경로 (1부터) */
export function titleArtPath(n: number): string {
  return `assets/title/title_keyart_${n}.webp`;
}

export function titleArtKey(n: number): string {
  return `title-keyart-${n}`;
}

/** 타이틀 그림 1~count 중 하나 (count가 0이면 null). r = [0, 1) 난수 (화면 전용 무작위) */
export function pickTitleArt(count: number, r: number): number | null {
  if (!(count > 0)) return null;
  return Math.min(count, Math.floor(r * count) + 1);
}
