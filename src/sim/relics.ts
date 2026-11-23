/**
 * V3 P2 유물 효과 (docs/v3/p0-spec.md 2장, game.json relics). 판 입력 MatchContext.relics(플레이어별 유물 id → Lv)에서 읽는다
 * — 해시 밖·리플레이와 판 저장에 기록. 유물이 하나도 없으면 모든 값이 0이라 예전 판과 같은 결과다.
 *
 * 값 = base + perLevel × (Lv − 1) (비율은 bp, 정수 효과는 원·명·칸). 같은 효과의 유물이 여럿이면 합.
 * 경제 효과(이자·시작 자금·일꾼)는 판 돈(MatchState.gold)이 하나라 플레이어 0의 유물로 계산한다 (멀티는 아직 없음).
 */
import { BP_ONE, bp, mulBp } from './Fixed';
import type { MatchContext } from './state';
import type { RelicConfig, RelicEffect } from '../data/load';
import { RELIC_INT_EFFECTS } from '../data/load';

export interface RelicRule {
  readonly id: string;
  readonly effect: RelicEffect;
  readonly maxLevel: number;
  /** Lv1 값과 레벨당 증가 (bp 또는 정수) */
  readonly base: number;
  readonly perLevel: number;
  /** goldAtk 합 상한 (bp, 없으면 0 = 상한 없음) */
  readonly capBp: number;
  /** interestCap: 100원당 이자 +n원 */
  readonly rateBonus: number;
}

/** 데이터 → 정수 규칙 (비율은 bp로, 0.0001 단위가 아니면 에러) */
export function buildRelicRules(list: readonly RelicConfig[]): ReadonlyMap<string, RelicRule> {
  const out = new Map<string, RelicRule>();
  for (const r of list) {
    const isInt = RELIC_INT_EFFECTS.includes(r.effect);
    const conv = (v: number, key: string): number => {
      if (isInt) return v;
      const b = bp(v);
      if (Math.abs(b - v * BP_ONE) > 1e-6) throw new Error(`game.json relics ${r.id}.${key}: 0.0001 단위여야 하는데 ${v}`);
      return b;
    };
    out.set(r.id, Object.freeze({ id: r.id, effect: r.effect, maxLevel: r.maxLevel, base: conv(r.base, 'base'), perLevel: conv(r.perLevel, 'perLevel'), capBp: r.cap === undefined ? 0 : conv(r.cap, 'cap'), rateBonus: r.rateBonus ?? 0 }));
  }
  return out;
}

/** 유물 하나의 Lv 값 */
export function relicValue(rule: Pick<RelicRule, 'base' | 'perLevel'>, level: number): number {
  return level < 1 ? 0 : rule.base + rule.perLevel * (level - 1);
}

type Ctx = Pick<MatchContext, 'rules' | 'relics' | 'cache'>;

/** 플레이어 owner가 가진 유물 중 그 효과의 값 합 (캐시 — 유물은 판 입력이라 판 동안 같다) */
export function relicSum(ctx: Ctx, owner: number, effect: RelicEffect): number {
  const key = `rl:${owner}:${effect}`;
  const hit = ctx.cache.get(key);
  if (typeof hit === 'number') return hit;
  let sum = 0;
  const mine = ctx.relics[owner];
  if (mine) {
    for (const id of Object.keys(mine).sort()) {
      const rule = ctx.rules.relics.get(id);
      if (rule && rule.effect === effect) sum += relicValue(rule, mine[id] as number);
    }
  }
  ctx.cache.set(key, sum);
  return sum;
}

/** interestCap 유물의 100원당 이자 추가 (가진 유물 중 rateBonus 합) */
export function relicInterestRate(ctx: Ctx, owner: number): number {
  const key = `rl:${owner}:rate`;
  const hit = ctx.cache.get(key);
  if (typeof hit === 'number') return hit;
  let sum = 0;
  const mine = ctx.relics[owner];
  if (mine) for (const id of Object.keys(mine).sort()) sum += ctx.rules.relics.get(id)?.rateBonus ?? 0;
  ctx.cache.set(key, sum);
  return sum;
}

/** 금화 망치: 보유금 1,000원마다 값 bp, 합 상한 (가진 유물 중 가장 큰 상한) */
export function relicGoldAtkBp(ctx: Ctx, owner: number, gold: number): number {
  const per = relicSum(ctx, owner, 'goldAtk');
  if (per <= 0 || gold < 1000) return 0;
  let cap = 0;
  const mine = ctx.relics[owner] ?? {};
  for (const id of Object.keys(mine)) {
    const r = ctx.rules.relics.get(id);
    if (r && r.effect === 'goldAtk' && r.capBp > cap) cap = r.capBp;
  }
  const raw = Math.floor(gold / 1000) * per;
  return cap > 0 && raw > cap ? cap : raw;
}

/** 도박 ×0 환급: 그 시도 비용 × 환급% (내림). 환급은 한 번뿐 — 잭팟 게이지·재시도를 부르지 않는다 */
export function relicGambleRefund(ctx: Ctx, owner: number, cost: number): number {
  const r = relicSum(ctx, owner, 'gambleRefund');
  return r > 0 ? mulBp(cost, r) : 0;
}
