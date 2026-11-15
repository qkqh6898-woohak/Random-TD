/**
 * 판 안 도박 (DEV_PLAN M5-5, GDD 7.2, PROGRESSION.md 9.2).
 *
 * - 명령 `gamble {t}`: 테이블 t(10원·100원·1000원·10000원)에 비용을 내고 배율을 하나 뽑아 비용 × 배율(내림)을 받는다.
 *   배율표 (game.json gamble.outcomes): ×0 40% · ×0.5 20% · ×1 15% · ×2 15% · ×3 7% · ×5 3% → 기대값 91%.
 * - 해금: 10원·100원 기본, 1000원 계정 Lv7, 10000원 계정 Lv20 (MatchContext.accountLevels = 메타에서 읽은 판 입력, 기본 1).
 *   debug 판(?debug=1)은 잠긴 테이블도 쓸 수 있고 그러면 debugUsed로 표시한다.
 * - 잭팟 게이지 (플레이어별): ×0이 나올 때마다 +1 (최대 10칸). 10칸이 찬 상태로 도박하면 그 도박은 ×3 이상 확정
 *   (×3·×5를 기본 확률 비율 7 : 3으로) 하고 게이지는 0.
 * - 도박꾼(유니크) 특색: 판 위에 있는 동안 ×0 확률 −3%p(Lv15 −10%p) → 그만큼 ×1에 더한다 (game.json zeroShiftTo,
 *   PROGRESSION.md 9.1 숙련도와 같은 방식). 같은 타워는 한 번만 (abilities.gambleZeroReduction). 숙련도(M10)는 아직 없다.
 * - 난수: 플레이어별 도박 흐름 `p{n}.gamble` — 도박 1번 = 난수 1개 (확률·잭팟 여부와 상관없이 같은 개수).
 * - 당첨금은 카드 '황금 손'(+25%) 보너스를 받지 않고, '번 돈'(goldEarned)에도 넣지 않는다 (도박 기대값이 100%를 넘지 않게).
 * - 실패하면 상태·난수를 바꾸지 않고 'gambleFail' { player, t, reason: phase · unknown · locked · gold }.
 *   성공하면 'gamble' { player, t, cost, mul(bp), win, jackpot, gauge, before(도박 직전 보유금) } — 미션(연속 0원·인생 역전·도박왕)이 구독한다.
 */
import type { Rng } from '../Rng';
import type { World } from '../World';
import { streamGamble } from '../World';
import { mulBp } from '../Fixed';
import type { GambleOutcome, MatchRules } from '../rules';
import type { GambleState, MatchContext } from '../state';
import { gambleZeroReduction } from '../abilities';
import { canAfford, spendGold } from './Economy';

export type GambleFail = 'phase' | 'unknown' | 'locked' | 'gold';

/** 플레이어 계정 레벨 (입력이 없으면 1). */
export function accountLevelOf(ctx: Pick<MatchContext, 'accountLevels'>, player: number): number {
  return ctx.accountLevels[player] ?? 1;
}

/** 테이블 t가 계정 레벨로 열려 있는가 (debug 허용은 따로). */
export function gambleUnlocked(ctx: Pick<MatchContext, 'rules' | 'accountLevels'>, player: number, t: number): boolean {
  const table = ctx.rules.gambleTables[t];
  return table !== undefined && accountLevelOf(ctx, player) >= table.unlockLevel;
}

/** 도박할 수 있는지 (화면 버튼과 명령이 같이 쓴다). 되면 null. debug 판은 잠긴 테이블도 된다. */
export function gambleCheck(ctx: Pick<MatchContext, 'rules' | 'state' | 'accountLevels'>, player: number, t: number): GambleFail | null {
  const { rules, state } = ctx;
  if (state.phase !== 'playing') return 'phase';
  const table = rules.gambleTables[t];
  if (!table) return 'unknown';
  if (!gambleUnlocked(ctx, player, t) && !state.debug) return 'locked';
  if (!canAfford(state, table.cost)) return 'gold';
  return null;
}

/**
 * 이번 도박의 배율별 가중치 (bp). ×0 확률을 zeroCutBp만큼 줄여(0 아래로는 안 감) 그만큼 shift 배율에 더한다.
 * 잭팟이면 ×minMul 이상만 기본 확률 비율로 (나머지 0).
 */
export function gambleWeights(rules: Pick<MatchRules, 'gambleOutcomes' | 'gambleZeroIndex' | 'gambleShiftIndex' | 'jackpotMinMulBp'>, zeroCutBp: number, jackpot: boolean): number[] {
  const w = rules.gambleOutcomes.map((o) => o.chanceBp);
  if (jackpot) return rules.gambleOutcomes.map((o, i) => (o.mulBp >= rules.jackpotMinMulBp ? (w[i] as number) : 0));
  if (zeroCutBp > 0) {
    const z = rules.gambleZeroIndex;
    const cut = zeroCutBp > (w[z] as number) ? (w[z] as number) : zeroCutBp;
    w[z] = (w[z] as number) - cut;
    w[rules.gambleShiftIndex] = (w[rules.gambleShiftIndex] as number) + cut;
  }
  return w;
}

/** 배율 하나 뽑기 (난수 1개). */
export function rollGamble(rng: Rng, rules: MatchRules, zeroCutBp: number, jackpot: boolean): GambleOutcome {
  return rules.gambleOutcomes[rng.weightedIndex(gambleWeights(rules, zeroCutBp, jackpot))] as GambleOutcome;
}

/** 이 배율로 받는 돈 = 비용 × 배율 내림. */
export function gamblePayout(cost: number, mulBpValue: number): number {
  return mulBp(cost, mulBpValue);
}

/** 기대값 (bp, 비용 대비): Σ 확률 × 배율 — 화면·테스트용 (내림 전 이론값). */
export function gambleExpectationBp(rules: Pick<MatchRules, 'gambleOutcomes' | 'gambleZeroIndex' | 'gambleShiftIndex' | 'jackpotMinMulBp'>, zeroCutBp = 0): number {
  const w = gambleWeights(rules, zeroCutBp, false);
  let total = 0;
  let sum = 0;
  rules.gambleOutcomes.forEach((o, i) => {
    total += w[i] as number;
    sum += (w[i] as number) * o.mulBp;
  });
  return total > 0 ? Math.floor(sum / total) : 0;
}

function stateOf(ctx: MatchContext, player: number): GambleState {
  const g = ctx.state.gamble[player];
  if (!g) throw new Error(`플레이어 ${player}의 도박 상태가 없다`);
  return g;
}

/** gamble 명령: 테이블 t에 도박 한 번. 성공하면 받은 돈(0 이상), 실패하면 null. */
export function gamble(ctx: MatchContext, world: World, player: number, t: number): number | null {
  const fail = gambleCheck(ctx, player, t);
  if (fail) {
    world.emit('gambleFail', { player, t, reason: fail });
    return null;
  }
  const { rules, state } = ctx;
  const table = rules.gambleTables[t] as { cost: number; unlockLevel: number };
  if (!gambleUnlocked(ctx, player, t)) state.debugUsed = true;
  const g = stateOf(ctx, player);
  const before = state.gold;
  spendGold(state, table.cost);
  const jackpot = g.gauge >= rules.jackpotGauge;
  const zeroCut = jackpot ? 0 : gambleZeroReduction(ctx, world, player);
  const out = rollGamble(world.rng(streamGamble(player)), rules, zeroCut, jackpot);
  const win = gamblePayout(table.cost, out.mulBp);
  state.gold += win;
  if (jackpot) g.gauge = 0;
  else if (out.mulBp === 0 && g.gauge < rules.jackpotGauge) g.gauge += 1;
  if (rules.gambleRecent > 0) {
    g.recent.push(out.mulBp);
    while (g.recent.length > rules.gambleRecent) g.recent.shift();
  }
  state.gambles += 1;
  world.emit('gamble', { player, t, cost: table.cost, mul: out.mulBp, win, jackpot, gauge: g.gauge, before });
  return win;
}
