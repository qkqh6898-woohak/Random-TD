/**
 * 판 내 강화 (DEV_PLAN M5-3·M5-4, GDD 7.1). 이번 판 동안 유지된다.
 *
 * - 명령 `upgrade {k}`: rules.upgrades[k]를 한 레벨 올린다 (k 순서 = 등급 강화 3종 → 능력치 강화 6종 → 초월). 실행 때 다시 검사한다.
 *   비용 Lv → Lv+1 = costBase + costPer × Lv (GDD 7.1 표: 일반 50 + 50·Lv, 공속 100 + 60·Lv …), 초월 = curves.json transcendCost[Lv]
 *   (= ⌊50,000 × 1.15^Lv⌋, 도구가 미리 계산). 길게 눌러 연속 강화는 화면이 명령을 여러 번 보낸다 (명령 하나 = 레벨 하나).
 * - 효과:
 *   - 등급 강화 (일반 = 노말·레어, 영웅 = 유니크·히어로, 전설 = 레전드·신·히든): 그 등급군 타워 공격력 +10%/Lv — 지금 있는 타워와
 *     앞으로 나올 타워 모두. 타워 등급마다 다르므로 Aura.towerBonus가 gradeUpgradeBp로 TowerBonus.atkPctBp에 더한다.
 *   - 능력치 강화 (모든 타워): 공속 +4%·물리/마법 관통 +2%·치명 확률 +1%p·치명 피해 +10%p·사거리 +2% → PlayerMods에 더한다.
 *   - 초월 (등급 강화 3종이 모두 최대일 때 열림): 모든 타워 공격력 +5%/Lv → PlayerMods.atkPctBp.
 *   - 소환 확률 (피드백 #27, k = 초월 다음): 레어 직행 소환 확률 +perLevel/Lv → Summon.summonRareChance가 summonUpgradeBp로 더한다.
 * - 한도 (M5-4, game.json combat): 최종 공속 = 기본의 5배·초당 15회, 관통 90%, 치명 확률 100% — stats.effectiveStats·Damage가 자른다.
 * - 실패하면 상태를 바꾸지 않고 'upgradeFail' { player, k, reason: phase · unknown · max · locked · gold }.
 *   성공하면 'upgrade' { player, k, id, lv, cost }. 판 상태 upgradesBought(미션 '강화 n회')를 1 올린다.
 * 학자 각성 '모든 강화 비용 −20%'는 각성(M9)과 함께.
 */
import type { World } from '../World';
import { BP_ONE } from '../Fixed';
import type { Grade } from '../../data/load';
import type { MatchRules, UpgradeRule } from '../rules';
import type { MatchContext, MatchState } from '../state';
import type { PlayerMods } from '../stats';
import { canAfford, spendGold } from './Economy';

export type UpgradeFail = 'phase' | 'unknown' | 'max' | 'locked' | 'gold';

/** 플레이어의 강화 레벨 배열 (없으면 빈 배열 → 모두 0). */
function levelsOf(state: Pick<MatchState, 'upgrades'>, player: number): readonly number[] {
  return state.upgrades[player] ?? [];
}

/** 강화 k의 지금 레벨. */
export function upgradeLevel(state: Pick<MatchState, 'upgrades'>, player: number, k: number): number {
  return levelsOf(state, player)[k] ?? 0;
}

/** id로 강화 찾기 (없으면 undefined). */
export function upgradeById(rules: Pick<MatchRules, 'upgrades'>, id: string): UpgradeRule | undefined {
  return rules.upgrades.find((u) => u.id === id);
}

/** 강화 u를 Lv → Lv+1로 올리는 비용 (최대면 null). */
export function upgradeCost(rules: Pick<MatchRules, 'transcendCost'>, u: UpgradeRule, lv: number): number | null {
  if (lv >= u.max) return null;
  if (u.kind === 'transcend') return rules.transcendCost[lv] ?? null;
  return u.costBase + u.costPer * lv;
}

/** 초월이 열렸는가: 등급 강화가 모두 최대 레벨. */
export function transcendOpen(rules: Pick<MatchRules, 'upgrades'>, state: Pick<MatchState, 'upgrades'>, player: number): boolean {
  for (const u of rules.upgrades) if (u.kind === 'grade' && upgradeLevel(state, player, u.k) < u.max) return false;
  return true;
}

/** 강화할 수 있는지 (화면 버튼과 명령이 같이 쓴다). 되면 null. */
export function upgradeCheck(ctx: Pick<MatchContext, 'rules' | 'state'>, player: number, k: number): UpgradeFail | null {
  const { rules, state } = ctx;
  if (state.phase !== 'playing') return 'phase';
  const u = rules.upgrades[k];
  if (!u) return 'unknown';
  const lv = upgradeLevel(state, player, k);
  const cost = upgradeCost(rules, u, lv);
  if (cost === null) return 'max';
  if (u.kind === 'transcend' && !transcendOpen(rules, state, player)) return 'locked';
  if (!canAfford(state, cost)) return 'gold';
  return null;
}

/** 능력치 강화 효과를 PlayerMods에 더한다. */
function applyStat(mods: PlayerMods, u: UpgradeRule): void {
  switch (u.stat) {
    case 'apsPct':
      mods.apsPctBp += u.perLevelBp;
      break;
    case 'armorPen':
      mods.armorPenBp += u.perLevelBp;
      break;
    case 'magicPen':
      mods.magicPenBp += u.perLevelBp;
      break;
    case 'critChance':
      mods.critChanceBp += u.perLevelBp;
      break;
    case 'critMul':
      mods.critMulBp += u.perLevelBp;
      break;
    case 'rangePct':
      mods.rangePctBp += u.perLevelBp;
      break;
    default:
      break;
  }
}

/** upgrade 명령: 강화 k 한 레벨. 성공하면 새 레벨, 실패하면 null. */
export function upgrade(ctx: MatchContext, world: World, player: number, k: number): number | null {
  const fail = upgradeCheck(ctx, player, k);
  if (fail) {
    world.emit('upgradeFail', { player, k, reason: fail });
    return null;
  }
  const { rules, state } = ctx;
  const u = rules.upgrades[k] as UpgradeRule;
  const lv = upgradeLevel(state, player, k);
  const cost = upgradeCost(rules, u, lv) as number;
  spendGold(state, cost);
  const levels = state.upgrades[player];
  if (!levels) throw new Error(`플레이어 ${player}의 강화 상태가 없다`);
  levels[k] = lv + 1;
  state.upgradesBought += 1;
  const mods = state.mods[player];
  if (mods) {
    if (u.kind === 'stat') applyStat(mods, u);
    else if (u.kind === 'transcend') mods.atkPctBp += u.perLevelBp;
  }
  world.emit('upgrade', { player, k, id: u.id, lv: lv + 1, cost });
  return lv + 1;
}

/** 등급 강화로 오른 공격력% (bp): 그 등급을 올리는 등급 강화 레벨 × 레벨당 값. */
export function gradeUpgradeBp(ctx: Pick<MatchContext, 'rules' | 'state'>, player: number, grade: Grade): number {
  const k = ctx.rules.gradeUpgradeOf.get(grade);
  if (k === undefined) return 0;
  const u = ctx.rules.upgrades[k] as UpgradeRule;
  return upgradeLevel(ctx.state, player, k) * u.perLevelBp;
}

/** 소환 확률 강화로 오른 레어 직행 소환 확률 (bp): 레벨 × 레벨당 값 (강화가 없으면 0). */
export function summonUpgradeBp(ctx: Pick<MatchContext, 'rules' | 'state'>, player: number): number {
  let bp = 0;
  for (const u of ctx.rules.upgrades) if (u.kind === 'summon') bp += upgradeLevel(ctx.state, player, u.k) * u.perLevelBp;
  return bp;
}

/** 강화 u의 Lv에서의 효과 (bp) — 화면 '+40% → +44%'용. */
export function upgradeEffectBp(u: UpgradeRule, lv: number): number {
  return u.perLevelBp * lv;
}

/** 강화로 오른 공속 배율 (bp, ×1 = 10000) — 화면 맨 위 '⚡×2.6'. 한도(기본의 apsMaxMul배)까지. */
export function upgradeApsMulBp(rules: Pick<MatchRules, 'apsMaxMul'>, mods: Pick<PlayerMods, 'apsPctBp'>): number {
  const v = BP_ONE + mods.apsPctBp;
  const cap = rules.apsMaxMul * BP_ONE;
  return v < 0 ? 0 : v > cap ? cap : v;
}

/** 지금 돈으로 강화 k를 연속으로 몇 번 할 수 있는지 (최대·잠김까지) — 화면 길게 누르기 안내·테스트용. */
export function affordableUpgrades(ctx: Pick<MatchContext, 'rules' | 'state'>, player: number, k: number): number {
  const u = ctx.rules.upgrades[k];
  if (!u || ctx.state.phase !== 'playing') return 0;
  if (u.kind === 'transcend' && !transcendOpen(ctx.rules, ctx.state, player)) return 0;
  let gold = ctx.state.gold;
  let lv = upgradeLevel(ctx.state, player, k);
  let n = 0;
  for (;;) {
    const cost = upgradeCost(ctx.rules, u, lv);
    if (cost === null || cost > gold) return n;
    gold -= cost;
    lv += 1;
    n += 1;
  }
}
