/**
 * 특색 능력 레지스트리 (DEV_PLAN M3-8): 타워 id → 능력 모듈. 모듈이 없는 타워(고블린·궁수 …)는 능력이 없다
 * (화상·독·출혈은 towers.json dot, 치명타·관통·감지는 스탯이라 모듈 없이 Combat이 처리한다).
 *
 * - M3-9: 기본 덱 25종 중 능력이 있는 16종 (특색 13종 + 광전사 연속 공격). 해금 타워 25종은 M7-2, 신·히든은 M6.
 * - 레지스트리는 처음 찾을 때 만든다 (모듈끼리 서로 import해도 — 처치 → 상인, 운석 → 처치 — 초기화 순서 문제가 없게).
 * - 특색 수치는 판마다 (주인, 타워 종류)별로 한 번 compile해 MatchContext.cache에 둔다 (해시 밖: 데이터 + 레벨에서 정해지는 값).
 * - 타워 레벨: MatchContext.levels[주인][타워 id], 없으면 1 (계정 성장 M9가 판을 만들 때 넣는다).
 */
import type { World } from '../World';
import { isTower, type Tower } from '../entities/Tower';
import type { MatchContext } from '../state';
import { ParamReader } from './params';
import type { AbilityDef, AbilityEnv } from './types';
import alchemist from './alchemist';
import archmage from './archmage';
import assassin from './assassin';
import berserker from './berserker';
import blacksmith from './blacksmith';
import chronomancer from './chronomancer';
import dragoncaller from './dragoncaller';
import fortuna from './fortuna';
import gambler from './gambler';
import icemage from './icemage';
import merchant from './merchant';
import miner from './miner';
import mudshaman from './mudshaman';
import scholar from './scholar';
import summoner from './summoner';
import warlord from './warlord';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 모듈마다 params 모양이 달라 레지스트리에서는 지운다
export type AnyAbility = AbilityDef<any>;

let registry: ReadonlyMap<string, AnyAbility> | null = null;

function build(): ReadonlyMap<string, AnyAbility> {
  const all: AnyAbility[] = [
    miner,
    merchant,
    mudshaman,
    icemage,
    gambler,
    blacksmith,
    berserker,
    summoner,
    scholar,
    chronomancer,
    alchemist,
    dragoncaller,
    warlord,
    archmage,
    assassin,
    fortuna,
  ];
  const map = new Map<string, AnyAbility>();
  for (const a of all) {
    if (map.has(a.id)) throw new Error(`능력 모듈 id 중복: ${a.id}`);
    map.set(a.id, a);
  }
  return map;
}

/** 그 타워 종류의 능력 모듈 (없으면 undefined). */
export function abilityOf(towerId: string): AnyAbility | undefined {
  registry ??= build();
  return registry.get(towerId);
}

/** 능력 모듈이 있는 타워 id 전부 (등록 순). */
export function abilityIds(): string[] {
  registry ??= build();
  return [...registry.keys()];
}

/** 주인 owner의 그 타워 종류 레벨 (기본 1). */
export function towerLevel(ctx: Pick<MatchContext, 'levels'>, owner: number, towerId: string): number {
  return ctx.levels[owner]?.[towerId] ?? 1;
}

/** 특색 수치 읽기 도구 (레벨 반영). */
export function paramReader(ctx: Pick<MatchContext, 'levels' | 'rules'>, owner: number, towerId: string): ParamReader {
  const stats = ctx.rules.towers.get(towerId);
  if (!stats) throw new Error(`없는 타워: ${towerId}`);
  return new ParamReader(towerId, stats.params, towerLevel(ctx, owner, towerId), ctx.rules.towerLevelMax);
}

/** 그 주인·타워 종류의 compile된 특색 수치 (캐시). */
export function abilityParams<P>(ctx: MatchContext, owner: number, def: AbilityDef<P>): P {
  const key = `${owner}:${def.id}`;
  if (ctx.cache.has(key)) return ctx.cache.get(key) as P;
  const p = def.compile(paramReader(ctx, owner, def.id));
  ctx.cache.set(key, p);
  return p;
}

/** 판 문맥 → 훅 문맥. */
export function envOf(ctx: MatchContext, world: World): AbilityEnv {
  return { ctx, world };
}

/**
 * 주인 owner의 판 위 타워들이 주는 값의 합 — 같은 타워 종류는 한 번만(가장 큰 값), 다른 종류는 더한다 (GDD 5.6 지원 효과 규칙).
 * pick이 undefined를 돌려주는 모듈은 건너뛴다. 예: 행운의 여신 2개 = 레어 직행 3%만.
 */
export function ownerBonus(ctx: MatchContext, world: World, owner: number, pick: (def: AnyAbility, params: unknown) => number | undefined): number {
  const best = new Map<string, number>();
  for (const e of world.entities.list()) {
    if (!isTower(e) || e.owner !== owner) continue;
    const def = abilityOf(e.tower);
    if (!def) continue;
    const v = pick(def, abilityParams(ctx, owner, def));
    if (v === undefined) continue;
    const prev = best.get(e.tower);
    if (prev === undefined || v > prev) best.set(e.tower, v);
  }
  let sum = 0;
  for (const v of best.values()) sum += v;
  return sum;
}

/** 판 위 타워 중 능력 모듈이 있는 것 (ID 순) + 그 모듈. */
export function towersWithAbility(world: World): { tower: Tower; def: AnyAbility }[] {
  const out: { tower: Tower; def: AnyAbility }[] = [];
  for (const e of world.entities.list()) {
    if (!isTower(e)) continue;
    const def = abilityOf(e.tower);
    if (def) out.push({ tower: e, def });
  }
  return out;
}

/** 모든 능력 모듈의 특색 수치를 레벨 1·최대에서 compile해 본다 (데이터 검사·테스트용). 문제가 있으면 에러. */
export function checkAllAbilityParams(ctx: Pick<MatchContext, 'rules'>): void {
  for (const id of abilityIds()) {
    const def = abilityOf(id) as AnyAbility;
    const stats = ctx.rules.towers.get(id);
    if (!stats) throw new Error(`능력 모듈 ${id}: towers.json에 없는 타워`);
    for (const lv of [1, ctx.rules.towerLevelMax]) def.compile(new ParamReader(id, stats.params, lv, ctx.rules.towerLevelMax));
  }
}

/** 도박 ×0 확률 감소 (bp, 도박꾼 −3%p → 300): 판 위 내 특색의 합, 같은 타워는 한 번만. M5 도박이 읽는다. */
export function gambleZeroReduction(ctx: MatchContext, world: World, player: number): number {
  return ownerBonus(ctx, world, player, (def, p) => def.gambleZeroBp?.(p));
}
