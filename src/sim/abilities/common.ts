/**
 * 능력 모듈이 같이 쓰는 도우미: 주기 타이머, 능력 돈, 건드릴 수 있는 몹 목록, 타워의 지금 능력치.
 */
import type { World } from '../World';
import { isMob, type Mob } from '../entities/Mob';
import type { Tower } from '../entities/Tower';
import { NO_MODS, effectiveStats, type EffectiveStats } from '../stats';
import { computeAuras, towerBonus } from '../systems/Aura';
import { earnGold } from '../systems/Economy';
import { isRevealed } from '../systems/Targeting';
import type { AbilityEnv } from './types';

/**
 * 주기 능력 준비: 타워가 처음 보이면 '지금 + 주기'로 시작하고 false (놓인 뒤 주기만큼 지나야 첫 발동),
 * 시각이 되었으면 true. 발동했으면 restartTimer로 다음 시각을 정한다 (발동할 대상이 없어 기다리면 다시 시작하지 않는다).
 */
export function timerReady(tower: Tower, tick: number, cdTicks: number): boolean {
  if (tower.abilityAt < 0) {
    tower.abilityAt = tick + cdTicks;
    return false;
  }
  return tick >= tower.abilityAt;
}

/** 주기 능력 발동 뒤 다음 시각 = 지금 + 주기. */
export function restartTimer(tower: Tower, tick: number, cdTicks: number): void {
  tower.abilityAt = tick + cdTicks;
}

/** 능력으로 돈 받기 + 'abilityGold' 사건 (화면: 타워 위 +n원·동전). */
export function giveGold(env: AbilityEnv, tower: Pick<Tower, 'id' | 'tower' | 'x' | 'y'>, amount: number): void {
  if (amount <= 0) return;
  earnGold(env.ctx.state, amount);
  env.world.emit('abilityGold', { tower: tower.id, towerId: tower.tower, amount, x: tower.x, y: tower.y });
}

/** 능력이 건드릴 수 있는 몹 (드러난 몹, ID 순). */
export function revealedMobs(world: World): Mob[] {
  const out: Mob[] = [];
  for (const e of world.entities.list()) if (isMob(e) && isRevealed(e)) out.push(e);
  return out;
}

/** 타워의 지금 능력치 (판 내 보정 + 오라 + 레벨 + 자기 특색). 주기 능력처럼 가끔 부르는 곳용 (오라를 새로 계산한다). */
export function towerEff(env: AbilityEnv, tower: Tower): EffectiveStats {
  const { ctx, world } = env;
  const stats = ctx.rules.towers.get(tower.tower);
  if (!stats) throw new Error(`없는 타워: ${tower.tower}`);
  return effectiveStats(ctx.rules, stats, ctx.state.mods[tower.owner] ?? NO_MODS, towerBonus(ctx, tower, computeAuras(ctx, world)));
}
