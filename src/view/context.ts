/** 장면들이 함께 쓰는 값. */
import type { GameData } from '../data/load';
import { isDevMode } from '../devMode';
import type { UiRoot } from '../ui/root';
import type { AccountStore } from '../meta/account';
import type { SettingsStore } from '../meta/settings';
import type { MatchSaves } from '../save/MatchSaves';
import type { BattleRecords } from '../save/BattleRecords';
import type { ScreenShake } from '../save/ScreenShake';
import type { EffectAudio } from '../audio/EffectAudio';

export interface GameContext {
  data: GameData;
  ui: UiRoot;
  /**
   * 개발자 모드 (`src/devMode.ts`: URL ?debug=1·?dev=1 또는 테스트 빌드) — 개발용 치트(⏭ 즉시 다음 단계·💰+),
   * 개발자 배속 ×1~×16(game.json devSpeeds), 잠긴 도박 테이블, 타이틀 [캠페인 1] (CLAUDE.md 4장). sim에는 debug 판으로 넘긴다.
   */
  debug: boolean;
  /** URL ?seed=123 — 같은 판 재현용. 없으면 무작위 */
  seed: number | null;
  /** 계정 레벨 (M8 전까지 저장값이 없으면 1) — 도박 테이블·×3 배속 해금. 판 시작 때 sim에 입력으로 넘긴다 */
  accountLevel: number;
  /** 계정 저장소 (히든 미션 영구 기록, M5-6) */
  account: AccountStore;
  /** 화면 설정 (T-2: 눌러서 바로 승급·연출 끄기·히든 미션 조건 보기) */
  settings: SettingsStore;
  /** 진행 중인 판 자동 저장 (A-1). 개발자 모드면 개발자 판 슬롯 */
  saves: MatchSaves;
  /** 전투 기록·최근 5판 (A-1) */
  records: BattleRecords;
  /** 화면 흔들림 설정 (A-1, 기기 저장) */
  screenShake: ScreenShake;
  /** 효과음 (A-1, WebAudio 합성) */
  audio: EffectAudio;
  version: string;
}

/** URL 쿼리에서 설정 읽기. testBuild = `import.meta.env.VITE_TEST_BUILD` (테스트 빌드면 개발자 모드). */
export function readUrlOptions(search: string, testBuild?: string | boolean | null): { debug: boolean; seed: number | null } {
  const p = new URLSearchParams(search);
  const seedRaw = p.get('seed');
  const seedNum = seedRaw !== null && /^\d{1,10}$/.test(seedRaw) ? Number(seedRaw) : null;
  return {
    debug: isDevMode(search, testBuild),
    seed: seedNum !== null && seedNum <= 0xffffffff ? seedNum : null,
  };
}
