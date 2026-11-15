/**
 * 기본 보스 패턴 모듈의 모양 (DEV_PLAN M4-5). 보스 id마다 `bosses/<id>.ts` 하나가 이 모양의 객체를 내보낸다.
 *
 * - compile: enemies.json bosses[].params → 정수 단위 (ParamReader, 판마다 한 번 → MatchContext.cache). 잘못된 값은
 *   `enemies.json bosses.{id}.params.{key}` 경로가 든 에러 (createMatch가 checkAllBossParams로 미리 확인).
 * - onSpawn: 보스가 나온 틱 — 주기 패턴 타이머 시작 (보스가 나온 뒤 주기만큼 지나야 첫 발동).
 * - tick: 틱마다 (MobTraits 시스템, 상태 이상 다음·이동 앞). 상태 기계:
 *   - 체력 문턱(분열·분노·피해 감소)은 행동 불가와 상관없이 문턱을 넘은 다음 틱에 한 번 (phaseFlags 비트).
 *   - 주기 패턴(소환·날기·회복·타워 기절)은 보스가 기절·정지·빙결 중이면 풀릴 때까지 기다렸다가 바로 (GDD 5.5 '정지 = 능력 정지').
 * 훅은 sim 안에서만 돈다. 난수는 보스 흐름(STREAM_BOSS)만 쓴다 (세계·소환 흐름과 독립).
 */
import type { World } from '../World';
import type { Mob } from '../entities/Mob';
import type { ParamReader } from '../abilities/params';
import type { MatchContext } from '../state';

export interface BossEnv {
  readonly ctx: MatchContext;
  readonly world: World;
}

export interface BossDef<P> {
  /** 보스 데이터 id (enemies.json bosses[].id) */
  readonly id: string;
  /** @param mobIds 소환할 수 있는 몹 id (enemies.json mobs) */
  compile(r: ParamReader, mobIds: readonly string[]): P;
  onSpawn?(env: BossEnv, mob: Mob, p: P): void;
  tick?(env: BossEnv, mob: Mob, p: P): void;
}

export function defineBoss<P>(def: BossDef<P>): BossDef<P> {
  return def;
}
