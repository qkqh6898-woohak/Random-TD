/**
 * 몹 처치 (M2-6 → M3b에서 Combat 밖으로): 몹 제거 + 처치 보상 + 'kill' 사건 + '처치될 때' 특색 (상인: 사거리 안 처치 +원).
 * 타워 공격·지속 피해·운석·소환 병사·즉사 모두 여기로 처치한다 → 처치 보상과 상인 돈이 어느 길이든 같다.
 *
 * M4:
 * - 깨짐 (ENEMIES.md 3.3·6장): 분열 슬라임 → 작은 슬라임 2마리 (체력 = 분열 슬라임 최대 체력 30%, 속도 1.8, 보상 없음),
 *   보석 골렘 → 작은 골렘 2마리 (체력 = 보석 골렘 최대 체력 35%). 죽은 자리(같은 진행도)에서 부모가 나온 단계 스탯으로, 몹 수에 들어간다.
 *   'split' 사건 { id, mob, count, x, y }. 이 틱의 전투 후보에는 없고 다음 틱부터 대상이 된다.
 * - M5 도전 보스: 처치하면 Challenge.challengeDown (무리 정리·보상·해금·쿨타임). 판의 보스 처치·깨짐과는 따로.
 * - 보스: 보스 조각(킹 슬라임 분열 조각 포함)을 모두 잡으면 보스 처치 → 200원 + 플레이어마다 카드 묶음 + 'bossKill' 사건,
 *   제한 시각을 지운다 (보스를 일찍 잡으면 남은 시간은 휴식, GDD 2.2).
 */
import type { World } from '../World';
import { mulBp } from '../Fixed';
import { isMob, type Mob } from '../entities/Mob';
import type { MatchContext } from '../state';
import { abilityParams, envOf, towersWithAbility } from '../abilities';
import { earnGold } from './Economy';
import { spawnMob } from './Spawn';
import { offerCards } from './Cards';
import { challengeDown } from './Challenge';

/** 판 위에 보스(조각)가 남아 있는가. 도전 보스(M5-2)는 판의 보스가 아니므로 세지 않는다. */
export function bossAlive(world: World): boolean {
  for (const e of world.entities.list()) if (isMob(e) && e.boss && !e.challenge) return true;
  return false;
}

/** 죽은 몹이 깨지는 몹이면 그 자리에 조각을 만든다. */
function splitOnDeath(ctx: MatchContext, world: World, mob: Mob, x: number, y: number): void {
  const split = ctx.rules.mobs.get(mob.mob)?.split;
  if (!split || mob.boss) return;
  let hp = mulBp(mob.maxHp, split.hpBp);
  if (hp < 1) hp = 1;
  let first = 0;
  for (let i = 0; i < split.count; i++) {
    const child = spawnMob(ctx, world, split.id, i, {
      progress: mob.progress,
      moveRem: mob.moveRem,
      hp,
      stage: mob.stage,
      ...(split.speed !== null ? { speed: split.speed } : {}),
      ...(split.reward !== null ? { reward: split.reward } : {}),
      small: split.small,
    });
    if (i === 0) first = child.id;
  }
  world.emit('split', { id: mob.id, mob: split.id, count: split.count, first, x, y });
}

/** 보스 조각 하나가 죽었다: 남은 조각이 없으면 보스 처치 (보상·카드·사건). */
function bossPartDown(ctx: MatchContext, world: World, x: number, y: number): void {
  const { state, rules } = ctx;
  if (bossAlive(world) || state.bossId === '') return;
  const got = earnGold(state, rules.bossReward);
  state.bossesKilled += 1;
  world.emit('bossKill', { boss: state.bossId, stage: state.stage, reward: got, x, y });
  const num = state.bossNum;
  state.bossId = '';
  state.bossDeadline = 0;
  offerCards(ctx, world, num);
}

/**
 * 몹 처치: 제거 + 보상 + 사건 + 깨짐 + 보스 처치 + 처치 특색 (타워 ID 순).
 * 이미 지운 몹이면 아무것도 하지 않는다 (M5 검토 반영: 쌍둥이 박쥐 하나가 죽으며 다른 하나를 지운 뒤, 같은 반복의
 * 지속 피해·광역 피해가 체력을 공유해 이미 0인 다른 하나를 다시 처치하면 처치 수·'kill' 사건·상인 돈이 두 번 나갔다).
 */
export function killMob(ctx: MatchContext, world: World, mob: Mob, x: number, y: number): void {
  if (!world.entities.remove(mob.id)) return;
  const reward = mob.reward > 0 ? earnGold(ctx.state, mob.reward) : 0;
  ctx.state.kills += 1;
  world.emit('kill', { id: mob.id, mob: mob.mob, reward, x, y, ...(mob.boss ? { boss: true } : {}), ...(mob.challenge ? { challenge: mob.challenge } : {}) });
  if (mob.challenge) challengeDown(ctx, world, mob, x, y);
  else {
    splitOnDeath(ctx, world, mob, x, y);
    if (mob.boss) bossPartDown(ctx, world, x, y);
  }
  const at = { x, y };
  let env: ReturnType<typeof envOf> | null = null;
  for (const { tower, def } of towersWithAbility(world)) {
    if (!def.onAnyKill) continue;
    env ??= envOf(ctx, world);
    def.onAnyKill(env, tower, abilityParams(ctx, tower.owner, def), mob, at);
  }
}
