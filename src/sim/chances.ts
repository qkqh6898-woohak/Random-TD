/**
 * 개발자 도구 '확률 조정' (T-2, 사용자 요청 "개발자는 확률도 0.1%씩 높일 수 있어야해").
 *
 * - 명령 `debugSetChance {key, bp}`: 개발자 판(state.debug)에서만 듣는다. key = game.json devChances.list의 이름,
 *   bp = 새 값 (stepBp = 10 bp = 0.1%p 단위, 0~10000으로 자름). bp = −1이면 그 key를 기본값으로, key 'all' + bp −1이면 모두 기본값.
 *   쓰면 debugUsed (개발용 치트 표시). 덮어쓴 값은 판 상태 state.chanceOv에 들어가 해시·리플레이에 남고, 새 판은 늘 기본값에서 시작한다.
 *   한 번도 쓰지 않은 판에는 chanceOv 필드 자체가 없다 → 예전 리플레이의 해시가 그대로다.
 * - key와 뜻 (mode: set = 그 값으로 바꿈, add = 기본 규칙 위에 더함):
 *   god (set) 신 타워 확률 — 소환·승급 (카드 '신의 눈길' 배율은 그 위에) ·
 *   gamble:i (set) 도박 배율표 i번째 배율의 확률 — ×0은 나머지를 흡수해 합이 늘 100% (×0이 0%보다 작아지면 그 값까지만 올라간다) ·
 *   cardRare (set) 보스 카드 1장이 희귀일 확률 · critBonus (add) 모든 타워 치명타 확률 + (한도 combat.critChanceMax) ·
 *   summonRare (add) 레어 직행 소환 확률 + (행운의 여신 위에) · mergeDouble (add) 2등급 승급 확률 + (행운의 여신 위에) ·
 *   elite (set) 정예 몹 확률 (정예 단계부터).
 * 결정성: 정수 bp만, 명령으로만 바뀐다 (Rng를 쓰는 판정은 이 값을 읽을 뿐).
 */
import type { World } from './World';
import { BP_ONE } from './Fixed';
import type { GambleOutcome, MatchRules } from './rules';
import type { MatchContext, MatchState } from './state';

export type ChanceMode = 'set' | 'add';

/** 기본 규칙 위에 더하는 key (기본값 0). 나머지는 그 값으로 바꾼다. */
const ADD_KEYS: ReadonlySet<string> = new Set(['critBonus', 'summonRare', 'mergeDouble']);

/** 'gamble:3' → 3 (도박 배율표 번호), 아니면 null. */
export function gambleChanceIndex(key: string): number | null {
  const m = /^gamble:(\d+)$/.exec(key);
  return m ? Number(m[1]) : null;
}

export function chanceMode(key: string): ChanceMode {
  return ADD_KEYS.has(key) ? 'add' : 'set';
}

type ChanceRules = Pick<MatchRules, 'godChanceBp' | 'gambleOutcomes' | 'gambleZeroIndex' | 'cardRareBp' | 'eliteChanceBp'>;

/** 기본값 (bp): set이면 데이터 값, add면 0. 모르는 key는 0. */
export function chanceBase(rules: ChanceRules, key: string): number {
  const gi = gambleChanceIndex(key);
  if (gi !== null) return rules.gambleOutcomes[gi]?.chanceBp ?? 0;
  switch (key) {
    case 'god':
      return rules.godChanceBp;
    case 'cardRare':
      return rules.cardRareBp;
    case 'elite':
      return rules.eliteChanceBp;
    default:
      return 0;
  }
}

/** 덮어쓴 값 (없으면 null). */
export function chanceOverride(state: Pick<MatchState, 'chanceOv'>, key: string): number | null {
  const v = state.chanceOv?.[key];
  return v === undefined ? null : v;
}

/** 지금 값 (bp) = 덮어쓴 값 ?? 기본값. add key는 '더하는 양'. */
export function chanceValue(rules: ChanceRules, state: Pick<MatchState, 'chanceOv'>, key: string): number {
  return chanceOverride(state, key) ?? chanceBase(rules, key);
}

/** add key의 더하는 양 (bp, 덮어쓰지 않았으면 0) — 판정 코드가 부른다. */
export function chanceBonus(state: Pick<MatchState, 'chanceOv'>, key: string): number {
  return state.chanceOv?.[key] ?? 0;
}

/** 배율표 확률의 합 (bp, 데이터 합 = 100%). */
function gambleTotal(rules: Pick<MatchRules, 'gambleOutcomes'>): number {
  let t = 0;
  for (const o of rules.gambleOutcomes) t += o.chanceBp;
  return t;
}

/** key가 가질 수 있는 최대 (bp): 도박은 ×0이 0% 아래로 내려가지 않는 만큼 (다른 배율들의 지금 값을 뺀 나머지), 나머지는 100%. */
export function chanceMaxBp(rules: ChanceRules, state: Pick<MatchState, 'chanceOv'>, key: string): number {
  const gi = gambleChanceIndex(key);
  if (gi === null) return BP_ONE;
  let others = 0;
  rules.gambleOutcomes.forEach((_o, i) => {
    if (i !== gi && i !== rules.gambleZeroIndex) others += chanceValue(rules, state, `gamble:${i}`);
  });
  const max = gambleTotal(rules) - others;
  return max < 0 ? 0 : max;
}

/**
 * 지금 도박 배율표 (확률 조정 반영): ×0이 아닌 배율은 지금 값, ×0 = 합 100%에서 나머지 (0 아래로는 안 감).
 * 덮어쓴 도박 확률이 없으면 데이터 배열을 그대로 돌려준다.
 */
export function effectiveGambleOutcomes(rules: ChanceRules, state: Pick<MatchState, 'chanceOv'>): readonly GambleOutcome[] {
  const ov = state.chanceOv;
  if (!ov || !Object.keys(ov).some((k) => gambleChanceIndex(k) !== null)) return rules.gambleOutcomes;
  let others = 0;
  const vals = rules.gambleOutcomes.map((_o, i) => {
    if (i === rules.gambleZeroIndex) return 0;
    const v = chanceValue(rules, state, `gamble:${i}`);
    others += v;
    return v;
  });
  const zero = gambleTotal(rules) - others;
  vals[rules.gambleZeroIndex] = zero < 0 ? 0 : zero;
  return rules.gambleOutcomes.map((o, i) => Object.freeze({ mulBp: o.mulBp, chanceBp: vals[i] as number }));
}

/** 확률 조정 실패 이유: 개발자 판이 아님 / 판이 끝남 / 모르는 key / 단위(stepBp)가 아님 */
export type SetChanceFail = 'notDebug' | 'phase' | 'unknown' | 'step';

/** 확률 조정 명령을 받을 수 있는지 (화면 버튼과 명령이 같이 쓴다). 되면 null. */
export function setChanceCheck(ctx: Pick<MatchContext, 'rules' | 'state'>, key: string, bp: number): SetChanceFail | null {
  const { rules, state } = ctx;
  if (!state.debug) return 'notDebug';
  if (state.phase !== 'playing') return 'phase';
  if (key === 'all') return bp === -1 ? null : 'step';
  if (!rules.devChanceKeys.includes(key)) return 'unknown';
  if (bp === -1) return null;
  if (!Number.isSafeInteger(bp) || bp < 0 || bp % rules.devChanceStepBp !== 0) return 'step';
  return null;
}

/**
 * debugSetChance 명령 실행. 성공하면 true ('chanceSet' { player, key, bp(실제로 들어간 값, 기본값으로 되돌리면 −1) }),
 * 실패하면 false ('chanceSetFail' { player, key, reason }). 값은 0 ~ chanceMaxBp로 자른다.
 */
export function setChance(ctx: MatchContext, world: World, player: number, key: string, bp: number): boolean {
  const fail = setChanceCheck(ctx, key, bp);
  if (fail) {
    world.emit('chanceSetFail', { player, key, reason: fail });
    return false;
  }
  const { state, rules } = ctx;
  state.debugUsed = true;
  if (key === 'all') {
    delete state.chanceOv;
    world.emit('chanceSet', { player, key, bp: -1 });
    return true;
  }
  const next: Record<string, number> = { ...(state.chanceOv ?? {}) };
  if (bp === -1) delete next[key];
  else {
    const max = chanceMaxBp(rules, state, key);
    next[key] = bp > max ? max : bp;
  }
  if (Object.keys(next).length === 0) delete state.chanceOv;
  else state.chanceOv = next;
  world.emit('chanceSet', { player, key, bp: bp === -1 ? -1 : (next[key] as number) });
  return true;
}
