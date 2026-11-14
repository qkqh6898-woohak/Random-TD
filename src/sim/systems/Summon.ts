/**
 * 소환 (DEV_PLAN M2-1, GDD 4.3).
 *
 * - `summon` 명령: 빈 배치 칸 (x, y) + 소환 비용(100원) → 그 칸에 타워 하나.
 *   명령은 화면이 미리 검사해서 보내지만, 실행 틱에 **다시 검사**한다 (같은 틱에 같은 칸 명령이 둘 와도 하나만 된다).
 *   실패하면 상태를 바꾸지 않고 난수도 쓰지 않으며 `summonFail` 사건 { reason }을 낸다.
 * - 판정 순서 (GDD 4.3): ① 신 타워 0.01% (덱과 무관, 신 3종 중 균등) → ② 레어 직행(행운의 여신·특성·카드, M3) → ③ 덱 노말 5종 균등.
 *   난수는 **플레이어별 소환 흐름**(`p{n}.summon`)만 쓴다 → 한 사람의 소환이 다른 사람·몹 등장 순서에 영향을 주지 않는다.
 *   신 판정은 확률과 상관없이 매번 난수 1개를 쓴다 (난수 사용 횟수가 데이터 확률에 따라 달라지지 않게).
 * - 신 타워는 지금 일반 타워처럼 공격만 한다 (전용 능력·강림 연출은 뒤 마일스톤).
 */
import type { Rng } from '../Rng';
import type { World } from '../World';
import { streamSummon } from '../World';
import { ATTACK_COST, TOWER_KIND, isTower, type Tower } from '../entities/Tower';
import { isBuildable, tileCenter } from '../map';
import type { Deck, MatchRules } from '../rules';
import type { MatchContext } from '../state';
import { canAfford, spendGold } from './Economy';

/** 소환 실패 이유: 판이 끝남 / 배치 칸이 아님 / 이미 타워가 있음 / 배치 칸이 가득 참 / 돈 부족 */
export type SummonFail = 'phase' | 'notBuildable' | 'occupied' | 'full' | 'gold';

/** 판 위 타워 수. */
export function towerCount(world: World): number {
  let n = 0;
  for (const e of world.entities.list()) if (isTower(e)) n++;
  return n;
}

/**
 * 칸 (x, y)에 소환할 수 있는지 (화면의 미리 검사와 명령 실행이 같이 쓴다). 되면 null.
 * 순서: 판 진행 중 → 배치 칸 → 비어 있음(모든 칸이 차 있으면 'full') → 돈.
 */
export function summonCheck(ctx: MatchContext, world: World, x: number, y: number): SummonFail | null {
  if (ctx.state.phase !== 'playing') return 'phase';
  if (!isBuildable(ctx.map, x, y)) return 'notBuildable';
  let count = 0;
  let occupied = false;
  for (const e of world.entities.list()) {
    if (!isTower(e)) continue;
    count++;
    if (e.tx === x && e.ty === y) occupied = true;
  }
  if (occupied) return count >= ctx.map.buildable.length ? 'full' : 'occupied';
  if (!canAfford(ctx.state, ctx.rules.summonCost)) return 'gold';
  return null;
}

/** 소환 판정 결과. */
export interface SummonRoll {
  tower: string;
  god: boolean;
}

/** 소환할 타워 고르기 (판정 순서는 파일 머리말). 덱 노말이 비어 있으면 에러. */
export function rollSummon(rng: Rng, rules: MatchRules, deck: Deck): SummonRoll {
  // ① 신 타워: 매번 난수 1개 (확률이 0이어도 같은 수를 쓴다)
  const god = rng.chanceBp(rules.godChanceBp);
  if (god && rules.godTowers.length > 0) return { tower: rng.pick(rules.godTowers), god: true };
  // ② 레어 직행: 확률을 주는 것(행운의 여신·특성·카드)이 M3부터 생긴다
  // ③ 덱 노말 5종 균등
  return { tower: rng.pick(deck.normal), god: false };
}

/** 칸에 타워를 놓는다 (검사 없이, 소환·테스트용). */
export function placeTower(world: World, towerId: string, owner: number, tx: number, ty: number): Tower {
  const c = tileCenter(tx, ty);
  return world.entities.add({
    kind: TOWER_KIND,
    tower: towerId,
    owner,
    tx,
    ty,
    x: c.x,
    y: c.y,
    atkAcc: ATTACK_COST,
    remDmg: 0,
    bornTick: world.tick,
    attacks: 0,
    pauseUntil: 0,
  } satisfies Omit<Tower, 'id'>) as Tower;
}

/** summon 명령 실행. 성공하면 놓인 타워, 실패하면 null (summonFail 사건). */
export function summon(ctx: MatchContext, world: World, player: number, x: number, y: number): Tower | null {
  const fail = summonCheck(ctx, world, x, y);
  if (fail) {
    world.emit('summonFail', { player, x, y, reason: fail });
    return null;
  }
  const deck = ctx.decks[player] ?? ctx.rules.baseDeck;
  spendGold(ctx.state, ctx.rules.summonCost);
  const roll = rollSummon(world.rng(streamSummon(player)), ctx.rules, deck);
  const tower = placeTower(world, roll.tower, player, x, y);
  ctx.state.summons += 1;
  const stats = ctx.rules.towers.get(roll.tower);
  world.emit('summon', { id: tower.id, tower: roll.tower, grade: stats?.grade ?? '', god: roll.god, player, x, y });
  return tower;
}
