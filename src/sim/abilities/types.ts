/**
 * 특색 능력 모듈의 모양 (DEV_PLAN M3-8). 타워 종류(id)마다 `abilities/<id>.ts` 하나가 이 모양의 객체를 내보낸다.
 *
 * - compile: towers.json params를 타워 레벨에 맞춰 정수로 바꾼다 (ParamReader, 판마다 주인·종류별로 한 번 → 캐시).
 * - 훅 (모두 선택):
 *   - tick       틱마다 (이동 다음, 소환 병사·전투 앞) — 주기 능력: 진흙 웅덩이·시간 정지·연금·운석·병사 소환
 *   - onAttack   공격 1회마다 (대상과 1회 공격이 정해진 뒤, 맞기 전) — 바꾼 공격을 돌려준다: 광부 돈·도박꾼 주사위·광전사 연속 공격
 *   - onHit      이 타워 종류의 공격이 몹에게 맞고 몹이 살아 있을 때 — 상태 이상·즉사: 진흙 둔화·빙결·표식·약화·암살자 즉사
 *                (투사체가 날아가는 사이 쏜 타워가 승급으로 사라져도 종류·주인으로 찾으므로 그대로 걸린다)
 *   - onAnyKill  판 위 몹이 처치될 때(누가 잡아도) 이 타워마다 — 상인
 *   - aura       지원 효과 (주변 8칸·24칸·전체 타워 공격력%·공속%) — 대장장이·학자·전쟁 군주 (Aura.ts가 합친다)
 *   - bossMulBp  자기 보스 피해 배율 (×) — 그림자 암살자
 *   - apsBonusBp 자기 공속% (타워 상태에 따라) — 광전사
 *   - summonRareBp / mergeDoubleBp  소환 레어 직행·승급 2등급 상승 확률 — 행운의 여신
 *   - gambleZeroBp  도박 ×0 확률 변화 (M5 도박이 읽는다) — 도박꾼
 * - 훅은 sim 안에서만 돈다 (Phaser·DOM 없음). 난수는 전투 흐름(STREAM_COMBAT)이나 플레이어별 소환 흐름만 쓴다.
 */
import type { World } from '../World';
import type { Mob } from '../entities/Mob';
import type { Tower } from '../entities/Tower';
import type { MatchContext } from '../state';
import type { RawHit } from '../systems/Damage';
import type { TargetCandidate } from '../systems/Targeting';
import type { ParamReader } from './params';

/** 지원 효과 범위: 주변 8칸(3×3, 자신 제외) · 주변 24칸(5×5, 자신 제외) · 전체(자신 포함) — GDD 5.6 */
export type AuraArea = 'around8' | 'around24' | 'global';
export const AURA_AREAS: readonly AuraArea[] = ['around8', 'around24', 'global'];

/** 타워에게 주는 지원 효과 하나. */
export interface AuraSpec {
  readonly area: AuraArea;
  /** 공격력% (bp) */
  readonly atkPctBp: number;
  /** 공격속도% (bp) */
  readonly apsPctBp: number;
}

/** 훅이 받는 판 문맥. */
export interface AbilityEnv {
  readonly ctx: MatchContext;
  readonly world: World;
}

/** 단위 좌표. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface AbilityDef<P> {
  /** 타워 데이터 id (towers.json) */
  readonly id: string;
  compile(r: ParamReader): P;
  tick?(env: AbilityEnv, tower: Tower, p: P): void;
  onAttack?(env: AbilityEnv, tower: Tower, p: P, hit: RawHit, target: TargetCandidate): RawHit;
  onHit?(env: AbilityEnv, mob: Mob, p: P, hit: RawHit, at: Point): void;
  onAnyKill?(env: AbilityEnv, tower: Tower, p: P, mob: Mob, at: Point): void;
  aura?(p: P): AuraSpec;
  bossMulBp?(p: P): number;
  apsBonusBp?(tower: Tower, p: P): number;
  summonRareBp?(p: P): number;
  mergeDoubleBp?(p: P): number;
  gambleZeroBp?(p: P): number;
}

/** 능력 정의 도우미 (타입 추론용). */
export function defineAbility<P>(def: AbilityDef<P>): AbilityDef<P> {
  return def;
}
