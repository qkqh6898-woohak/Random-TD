/**
 * 타워 판매·개발자 변환 (T-2, 사용자 요청 "타워는 이동기능과 50%가격으로 판매, 동일 등급 다른 타워로 변환 기능(개발자용)").
 *
 * - `sellTower {x, y}`: 칸 (x, y)의 내 타워를 팔고 판매가를 받는다. 판매가 = 가치 × sell.rateBp(50%) 내림,
 *   가치 = 소환 비용(할인 전) × 등급 배율 (노말 1·레어 3·유니크 9·히어로 27·레전드 81·신 = 레전드, game.json sell.gradeMul),
 *   히든 = 조합 재료 3개 가치의 합 (rules.towerValues). 노말 50원 · 레어 150원 · 유니크 450원 · 히어로 1,350원 · 레전드 4,050원.
 *   타워를 지우고 칸을 비운다 (승급 재료로 사라질 때와 같다 → 오라·특색·투사체는 다음 틱부터 그 타워 없이).
 *   '승급의 축복' 선택이 걸려 있던 타워면 그 선택도 지운다. 판 돈은 '번 돈'(goldEarned)이 아니고 카드 '황금 손'도 받지 않는다
 *   (가치의 절반이라 소환·승급을 되파는 돈벌이가 되지 않는다). 판 수 state.sells (처음 판매 때 생김).
 *   실패: 'sellFail' { player, x, y, reason: phase · noTower · notOwner }. 성공: 'sell' { player, id, tower, grade, x, y, gold }.
 *   히어로 이상 확인(두 번 누르기)은 화면 일이다 (sim은 받은 명령을 그대로 실행).
 * - `debugConvertTower {x, y, t}` (개발자 판만): 칸의 내 타워를 towers.json 순서 t번째 타워로 그 자리에서 바꾼다 — 같은 등급의
 *   다른 타워만. 같은 엔티티(같은 id·칸·소환 순서)이고 판 내 스택·공격 타이머·주기 능력은 새로 (승급의 축복 '바꿈'과 같다).
 *   debugUsed 표시. 실패: 'convertFail' { reason: notDebug · phase · noTower · notOwner · unknown · grade · same }.
 *   성공: 'convert' { player, id, from, tower, grade, x, y }.
 */
import type { World } from '../World';
import { mulBp } from '../Fixed';
import { ATTACK_COST, topTowerAt, towerAt, towersAt, type Tower } from '../entities/Tower';
import type { MatchContext } from '../state';

export type SellFail = 'phase' | 'noTower' | 'notOwner';

/** 타워 id의 판매가 (원) = 가치 × 판매 비율 내림. 모르는 타워는 0. */
export function sellPrice(rules: MatchContext['rules'], towerId: string): number {
  return mulBp(rules.towerValues.get(towerId) ?? 0, rules.sellRateBp);
}

export type SellCheck = { ok: true; tower: Tower; price: number } | { ok: false; reason: SellFail };

/** 팔 수 있는지 (화면 버튼과 명령이 같이 쓴다). */
export function sellCheck(ctx: MatchContext, world: World, player: number, x: number, y: number): SellCheck {
  if (ctx.state.phase !== 'playing') return { ok: false, reason: 'phase' };
  // G-1 칸 무더기: 맨 위(가장 나중에 쌓인) 타워 하나를 판다 (타워가 하나면 예전과 같다)
  const tower = topTowerAt(world, x, y);
  if (!tower) return { ok: false, reason: 'noTower' };
  if (tower.owner !== player) return { ok: false, reason: 'notOwner' };
  return { ok: true, tower, price: sellPrice(ctx.rules, tower.tower) };
}

/** 이 엔티티에 걸린 '승급의 축복' 선택을 지운다. */
function dropMergePicks(ctx: MatchContext, id: number): void {
  if (ctx.state.mergePicks.length > 0) ctx.state.mergePicks = ctx.state.mergePicks.filter((m) => m.id !== id);
}

/** sellTower 명령 실행. 성공하면 받은 돈, 실패하면 null. */
export function sellTower(ctx: MatchContext, world: World, player: number, x: number, y: number): number | null {
  const check = sellCheck(ctx, world, player, x, y);
  if (!check.ok) {
    world.emit('sellFail', { player, x, y, reason: check.reason });
    return null;
  }
  const { tower, price } = check;
  const { state, rules } = ctx;
  world.entities.remove(tower.id);
  dropMergePicks(ctx, tower.id);
  state.gold += price;
  state.sells = (state.sells ?? 0) + 1;
  world.emit('sell', { player, id: tower.id, tower: tower.tower, grade: rules.towers.get(tower.tower)?.grade ?? '', x, y, gold: price });
  return price;
}

export type ConvertFail = 'notDebug' | 'phase' | 'noTower' | 'notOwner' | 'unknown' | 'grade' | 'same';

/** 바꿀 수 있는지 (개발자 변환 고르기 창과 명령이 같이 쓴다). 되면 null. */
export function convertCheck(ctx: MatchContext, world: World, player: number, x: number, y: number, t: number): ConvertFail | null {
  const { state, rules } = ctx;
  if (!state.debug) return 'notDebug';
  if (state.phase !== 'playing') return 'phase';
  const tower = towerAt(world, x, y);
  if (!tower) return 'noTower';
  if (tower.owner !== player) return 'notOwner';
  const id = rules.towerOrder[t];
  const to = id === undefined ? undefined : rules.towers.get(id);
  if (!to || id === undefined) return 'unknown';
  if (id === tower.tower) return 'same';
  if (rules.towers.get(tower.tower)?.grade !== to.grade) return 'grade';
  return null;
}

/** 같은 등급의 다른 타워 id (towers.json 순서) — 변환 고르기 창 목록. */
export function convertTargets(rules: MatchContext['rules'], towerId: string): string[] {
  const grade = rules.towers.get(towerId)?.grade;
  return rules.towerOrder.filter((id) => id !== towerId && rules.towers.get(id)?.grade === grade);
}

/** debugConvertTower 명령 실행. 성공하면 true. */
export function convertTower(ctx: MatchContext, world: World, player: number, x: number, y: number, t: number): boolean {
  const fail = convertCheck(ctx, world, player, x, y, t);
  if (fail) {
    world.emit('convertFail', { player, x, y, t, reason: fail });
    return false;
  }
  const { rules, state } = ctx;
  const tower = towerAt(world, x, y) as Tower;
  const to = rules.towerOrder[t] as string;
  const from = tower.tower;
  state.debugUsed = true;
  // G-1 칸 무더기: 같은 칸 타워를 모두 바꾼다 (한 칸에는 같은 타워만)
  for (const s of towersAt(world, x, y)) {
    dropMergePicks(ctx, s.id);
    s.tower = to;
    s.atkAcc = ATTACK_COST;
    s.remDmg = 0;
    s.abilityAt = -1;
    s.stacks = 0;
    s.stackTarget = 0;
  }
  world.emit('convert', { player, id: tower.id, from, tower: to, grade: rules.towers.get(to)?.grade ?? '', x, y });
  return true;
}
