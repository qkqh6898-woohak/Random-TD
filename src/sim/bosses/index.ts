/**
 * 보스 패턴 레지스트리 (DEV_PLAN M4-5): 보스 id → 패턴 모듈. 기본 대장 5종 (킹 슬라임·박쥐 여왕·고대 골렘·망령 군주·혼돈의 용).
 * 4천왕·군주·테마 대장은 M6에서 같은 모양으로 더한다.
 * - 레지스트리는 처음 찾을 때 만든다 (Spawn ↔ 보스 모듈이 서로 import해도 초기화 순서 문제가 없게).
 * - 패턴 수치는 판마다 보스 종류별로 한 번 compile해 MatchContext.cache('boss:{id}')에 둔다 (데이터에서 정해지는 값 → 해시 밖).
 */
import type { World } from '../World';
import type { Mob } from '../entities/Mob';
import type { MatchContext } from '../state';
import { ParamReader } from '../abilities/params';
import type { BossDef, BossEnv } from './types';
import ancientgolem from './ancientgolem';
import batqueen from './batqueen';
import chaosdragon from './chaosdragon';
import kingslime from './kingslime';
import wraithlord from './wraithlord';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 모듈마다 params 모양이 달라 레지스트리에서는 지운다
export type AnyBoss = BossDef<any>;

let registry: ReadonlyMap<string, AnyBoss> | null = null;

function build(): ReadonlyMap<string, AnyBoss> {
  const map = new Map<string, AnyBoss>();
  for (const b of [kingslime, batqueen, ancientgolem, wraithlord, chaosdragon] as AnyBoss[]) {
    if (map.has(b.id)) throw new Error(`보스 모듈 id 중복: ${b.id}`);
    map.set(b.id, b);
  }
  return map;
}

/** 보스 id의 패턴 모듈 (없으면 undefined). */
export function bossDefOf(id: string): AnyBoss | undefined {
  registry ??= build();
  return registry.get(id);
}

/** 패턴 모듈이 있는 보스 id 전부. */
export function bossModuleIds(): string[] {
  registry ??= build();
  return [...registry.keys()];
}

/** 그 보스의 compile한 패턴 수치 (캐시). 데이터가 없는 보스면 에러. */
export function bossParams<P>(ctx: Pick<MatchContext, 'rules' | 'cache'>, def: BossDef<P>): P {
  const key = `boss:${def.id}`;
  const hit = ctx.cache.get(key);
  if (hit !== undefined) return hit as P;
  const stats = ctx.rules.bosses.get(def.id);
  if (!stats) throw new Error(`보스 데이터가 없다: ${def.id}`);
  const p = def.compile(new ParamReader(def.id, stats.params, 1, 1, `enemies.json bosses.${def.id}.params`), ctx.rules.mobOrder);
  ctx.cache.set(key, p);
  return p;
}

/** 모든 기본 보스 데이터에 모듈이 있고 수치가 올바른지 (createMatch가 부른다 — 틀리면 판을 만들 때 경로가 든 에러). */
export function checkAllBossParams(ctx: Pick<MatchContext, 'rules' | 'cache'>): void {
  for (const id of ctx.rules.bossOrder) {
    const def = bossDefOf(id);
    if (!def) throw new Error(`enemies.json bosses.${id}: 패턴 모듈(src/sim/bosses/${id}.ts)이 없다`);
    bossParams(ctx, def);
  }
}

export function bossEnv(ctx: MatchContext, world: World): BossEnv {
  return { ctx, world };
}

/** 보스가 나온 틱: 패턴 타이머 시작. */
export function bossSpawned(ctx: MatchContext, world: World, mob: Mob): void {
  const def = bossDefOf(mob.mob);
  if (def?.onSpawn) def.onSpawn(bossEnv(ctx, world), mob, bossParams(ctx, def));
}

/** 보스 한 마리의 틱 (MobTraits). */
export function bossTick(ctx: MatchContext, world: World, mob: Mob): void {
  const def = bossDefOf(mob.mob);
  if (def?.tick) def.tick(bossEnv(ctx, world), mob, bossParams(ctx, def));
}
