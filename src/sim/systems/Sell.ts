/**
 * 타워 판매·개발자 변환 (T-2, 사용자 요청 "타워는 이동기능과 50%가격으로 판매, 동일 등급 다른 타워로 변환 기능(개발자용)").
 *
 * - `sellTower {x, y}`: 칸 (x, y)의 내 타워를 팔고 판매가를 받는다. 판매가 = 가치 × sell.rateBp(50%) 내림,
 *   가치 = 노말 가치(game.json sell.baseValue — V2.0 PR-A부터 소환 비용과 따로) × 등급 배율 (노말 1·레어 3·유니크 9·히어로 27·레전드 81·
 *   신 = 레전드, game.json sell.gradeMul), 히든 = 조합 재료 가치의 합 (rules.towerValues). 노말 15원 · 레어 45원 · 유니크 135원 ·
 *   히어로 405원 · 레전드 1,215원.
 *   **되팔기 돈벌이 없음 (V2.0 PR-A, 검토 H2)**: 일반 소환이 낼 수 있는 등급(노말·레어 직행·신 — rules.summonOutcomeGrades)은
 *   판매가가 늘 **그 주인의 지금 소환 비용 − 1원** 이하 (`sellPriceFor`). 소환 비용은 할인 카드를 모두 받아도 기본 22원 아래로 안 내려가고
 *   소환할수록 오르므로, 어떤 할인·확률 상태에서도 소환 → 판매는 한 번마다 1원 이상 잃는다.
 *   타워를 지우고 칸을 비운다 (승급 재료로 사라질 때와 같다 → 오라·특색·투사체는 다음 틱부터 그 타워 없이).
 *   '승급의 축복' 선택이 걸려 있던 타워면 그 선택도 지운다. 판 돈은 '번 돈'(goldEarned)이 아니고 카드 '황금 손'도 받지 않는다
 *   (가치의 절반이라 소환·승급을 되파는 돈벌이가 되지 않는다). 판 수 state.sells (처음 판매 때 생김).
 *   실패: 'sellFail' { player, x, y, reason: phase · noTower · notOwner }. 성공: 'sell' { player, id, tower, grade, x, y, gold }.
 *   히어로 이상 확인(두 번 누르기)은 화면 일이다 (sim은 받은 명령을 그대로 실행).
 * - `debugConvertTower {x, y, t}` (개발자 판만): 칸의 내 타워를 towers.json 순서 t번째 타워로 그 자리에서 바꾼다 — 같은 등급의
 *   다른 타워만. 같은 엔티티(같은 id·칸·소환 순서)이고 판 내 스택·공격 타이머·주기 능력은 새로 (승급의 축복 '바꿈'과 같다).
 *   debugUsed 표시. 실패: 'convertFail' { reason: notDebug · phase · noTower · notOwner · unknown · grade · same }.
 *   성공: 'convert' { player, id, from, tower, grade, x, y }.
 * - 자동 판매 (피드백 #46 '노말 이하 / 희귀 이하 자동 판매 체크'): 화면 설정이라 sim 규칙은 그대로다. 화면이 방금 소환된 타워 id로
 *   `autoSellTiles`를 불러 고른 칸에 평소 sellTower 명령을 보낸다 (리플레이에 그대로 남는다).
 */
import type { World } from '../World';
import { mulBp } from '../Fixed';
import { ATTACK_COST, isTower, topTowerAt, towerAt, towersAt, type Tower } from '../entities/Tower';
import type { MatchContext } from '../state';
import { GACHA_RANK, gradeRank } from '../rules';
import { summonCost } from './Summon';

export type SellFail = 'phase' | 'noTower' | 'notOwner';

/** 타워 id의 표 판매가 (원) = 가치 × 판매 비율 내림. 모르는 타워는 0. 실제 판매가는 sellPriceFor (소환 비용 상한). */
export function sellPrice(rules: MatchContext['rules'], towerId: string): number {
  return mulBp(rules.towerValues.get(towerId) ?? 0, rules.sellRateBp);
}

/**
 * 실제 판매가 (원, V2.0 PR-A): 표 판매가, 단 일반 소환이 낼 수 있는 등급(rules.summonOutcomeGrades)이면 주인의 지금 소환 비용 − 1 이하.
 * 판매 명령·정보 패널·자동 판매가 모두 이 값을 쓴다.
 */
export function sellPriceFor(ctx: Pick<MatchContext, 'rules' | 'state'>, towerId: string, owner: number): number {
  const price = sellPrice(ctx.rules, towerId);
  const grade = ctx.rules.towers.get(towerId)?.grade;
  if (!grade || !ctx.rules.summonOutcomeGrades.includes(grade)) return price;
  const cap = summonCost(ctx, owner) - 1;
  return price > cap ? (cap > 0 ? cap : 0) : price;
}

/**
 * 자동 판매 대상이 되는 소환 사건인가 (피드백 #46 + 검토 L4): 그 플레이어의 일반 소환만 — 개발자 놓기(debug)·소환 도박(gacha) 결과는
 * 팔지 않는다 (도박에 돈을 더 내고 고른 결과를 바로 되파는 일이 없게).
 */
export function isAutoSellSummon(ev: Readonly<Record<string, string | number | boolean | undefined>>, player: number): boolean {
  return ev.player === player && ev.debug !== true && ev.gacha === undefined;
}

export type SellCheck = { ok: true; tower: Tower; price: number } | { ok: false; reason: SellFail };

/** 팔 수 있는지 (화면 버튼과 명령이 같이 쓴다). */
export function sellCheck(ctx: MatchContext, world: World, player: number, x: number, y: number): SellCheck {
  if (ctx.state.phase !== 'playing') return { ok: false, reason: 'phase' };
  // G-1 칸 무더기: 맨 위(가장 나중에 쌓인) 타워 하나를 판다 (타워가 하나면 예전과 같다)
  const tower = topTowerAt(world, x, y);
  if (!tower) return { ok: false, reason: 'noTower' };
  if (tower.owner !== player) return { ok: false, reason: 'notOwner' };
  return { ok: true, tower, price: sellPriceFor(ctx, tower.tower, tower.owner) };
}

/** 자동 판매 기준 등급 (이 등급 이하를 판다). */
export type AutoSellGrade = 'normal' | 'rare';

/**
 * 자동 판매할 칸 (피드백 #46): ids(방금 소환된 타워 엔티티) 중 아직 판 위에 있고, player 것이며, 등급이 maxGrade 이하인 타워의 칸 (id 순).
 * 신·히든은 판 적이 없다 (히든은 레전드로 본다). 판이 끝났으면 빈 목록. 같은 칸이 여러 번 나오면 그 칸 맨 위부터 그만큼 판다
 * (한 칸에는 같은 타워만 쌓이므로 등급이 같다).
 */
export function autoSellTiles(ctx: MatchContext, world: World, player: number, ids: readonly number[], maxGrade: AutoSellGrade): [number, number][] {
  if (ctx.state.phase !== 'playing') return [];
  const max = GACHA_RANK[maxGrade];
  const out: [number, number][] = [];
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    const e = world.entities.get(id);
    if (!e || !isTower(e) || e.owner !== player) continue;
    const grade = ctx.rules.towers.get(e.tower)?.grade;
    if (grade && gradeRank(grade) <= max) out.push([e.tx, e.ty]);
  }
  return out;
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
