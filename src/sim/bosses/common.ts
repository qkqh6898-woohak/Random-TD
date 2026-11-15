/**
 * 보스·몹 특성이 같이 쓰는 도우미: 주변 몹 회복, 자기 자리에 몹 소환, 체력 문턱 확인.
 */
import type { World } from '../World';
import { dist2, mulBp } from '../Fixed';
import { isMob, type Mob } from '../entities/Mob';
import { positionAt } from '../map';
import type { MatchContext } from '../state';
import { spawnMob } from '../systems/Spawn';

/** 체력이 최대 체력 × thresholdBp 이하인가 (살아 있을 때만). 큰 체력도 정확하게 (mulBp). */
export function hpAtOrBelow(mob: Pick<Mob, 'hp' | 'maxHp'>, thresholdBp: number): boolean {
  return mob.hp > 0 && mob.hp <= mulBp(mob.maxHp, thresholdBp);
}

/**
 * 반경 radius(단위) 안의 **다른** 몹 체력을 각자 최대 체력 × pctBp만큼 회복 (최소 1, 최대 체력을 넘지 않음). ID 순.
 * 'heal' 사건 { target, amount, x, y, src } (화면: 초록 숫자). 회복한 몹 수를 돌려준다.
 */
export function healAround(ctx: MatchContext, world: World, healer: Mob, radius: number, pctBp: number): number {
  const path = ctx.map.path;
  const c = positionAt(path, healer.progress);
  const r2 = radius * radius;
  let n = 0;
  for (const e of world.entities.list()) {
    if (!isMob(e) || e.id === healer.id || e.hp >= e.maxHp) continue;
    const p = positionAt(path, e.progress);
    if (dist2(c.x, c.y, p.x, p.y) > r2) continue;
    let amount = mulBp(e.maxHp, pctBp);
    if (amount < 1) amount = 1;
    if (e.hp + amount > e.maxHp) amount = e.maxHp - e.hp;
    e.hp += amount;
    n++;
    world.emit('heal', { target: e.id, amount, x: p.x, y: p.y, src: healer.id });
  }
  return n;
}

/** 보스 자리(진행도)에 몹 count마리 소환 (지금 단계 스탯). 떼 순번으로 화면에서 옆으로 벌려 그린다. */
export function summonAround(ctx: MatchContext, world: World, boss: Mob, mobId: string, count: number, invisible?: boolean): Mob[] {
  const out: Mob[] = [];
  for (let i = 0; i < count; i++) {
    out.push(spawnMob(ctx, world, mobId, i, { progress: boss.progress, moveRem: boss.moveRem, ...(invisible ? { invisible: true } : {}) }));
  }
  world.emit('bossSummon', { boss: boss.id, mob: mobId, count, first: out[0]?.id ?? 0 });
  return out;
}
