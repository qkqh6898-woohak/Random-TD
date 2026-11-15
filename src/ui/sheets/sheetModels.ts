/**
 * 하단 메뉴 바텀 시트의 표시값 (순수 함수, DOM·Phaser 없음 → 단위 테스트로 "값이 sim과 일치"를 확인한다).
 * UI.md 4.1(하단 메뉴 배지)·4.5(바텀 시트), GDD 6~8장, DEV_PLAN M5-1·M5-7.
 *
 * - 하단 메뉴 배지: ⚔ 도전 '1 가능'(진행 중이면 '진행 중') · ⬆ 강화 'Lv 5'(강화 레벨 합) · 📋 미션 '2 받기'.
 * - ⚔ 도전 시트: 10단계 카드 (이름·체력·보상·특수 능력·상태 [시작] / ⏳4:32 / 🔒 / 진행 중), 맨 위 '진행 중 18초'.
 * - ⬆ 강화 시트: 맨 위 '⚡×2.6'(지금 공속 배율), [등급 강화] 3줄 / [능력치 강화] 6줄 + 초월(열렸을 때) / [도박] 테이블 4개·
 *   잭팟 게이지 10칸·배율표·최근 결과 5개. 줄마다 Lv, 효과 '+40% → +44%', [비용] 버튼.
 * - 📋 미션 시트: [일반 30] [히든 ???] 탭, 진행도 바, [받기], 맨 위 [모두 받기]. 받을 수 있는 것 → 진행 중 → 받은 것 순.
 *   히든은 이번 판에 달성했거나 예전에 발견해 영구 기록된 것만 이름을 보이고 나머지는 '???'.
 * 버튼이 눌리는지는 sim의 검사 함수(upgradeCheck·gambleCheck·challengeCheck·claimCheck)를 그대로 쓴다 → 화면과 명령 판정이 같다.
 */
import type { Grade } from '../../data/load';
import type { World } from '../../sim/World';
import { TICK_HZ } from '../../sim/World';
import { BP_ONE } from '../../sim/Fixed';
import { gambleZeroReduction } from '../../sim/abilities';
import type { MatchRules, UpgradeRule } from '../../sim/rules';
import { MISSION_CLAIMED, MISSION_DONE, MISSION_OPEN, type MatchContext } from '../../sim/state';
import { challengeCheck, challengeCooldownLeft, challengesAvailable } from '../../sim/systems/Challenge';
import { goldWithBonus } from '../../sim/systems/Economy';
import { gambleCheck, gambleExpectationBp, gambleRollExpectationBp, gambleTopMulBp, gambleUnlocked, gambleWeights } from '../../sim/systems/Gamble';
import { missionProgress, missionsClaimable, towerCensus } from '../../sim/systems/Mission';
import { transcendOpen, upgradeCheck, upgradeCost, upgradeEffectBp, upgradeLevel } from '../../sim/systems/Upgrade';
import { formatGold, formatTimer, withCommas } from '../hud/hudModel';

export type SheetKind = 'challenge' | 'upgrade' | 'mission';
export type UpgradeTab = 'grade' | 'stat' | 'gamble';
export type MissionTab = 'normal' | 'hidden';

const GRADE_SHORT: Readonly<Record<Grade, string>> = {
  normal: '노말',
  rare: '레어',
  unique: '유니크',
  hero: '히어로',
  legend: '레전드',
  god: '신',
  hidden: '히든',
};

// ---------------------------------------------------------------- 숫자 표시

/** bp → 퍼센트 글자 (소수 둘째 자리까지, 끝의 0은 뺀다): 400 → '4', 1050 → '10.5'. */
export function pctText(bp: number): string {
  const sign = bp < 0 ? '-' : '';
  const a = Math.abs(Math.trunc(bp));
  const whole = Math.floor(a / 100);
  const frac = a % 100;
  if (frac === 0) return `${sign}${withCommas(whole)}`;
  const f = String(frac).padStart(2, '0').replace(/0$/, '');
  return `${sign}${withCommas(whole)}.${f}`;
}

/** 배율 bp → '×2.6' (소수 둘째 자리까지 내림, 끝의 0은 뺀다). */
export function mulText(mulBp: number): string {
  const hundredths = Math.floor(mulBp / 100);
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  if (frac === 0) return `×${whole}`;
  return `×${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

/** 남은 틱 → 올림 초. */
function secCeil(ticks: number): number {
  return ticks <= 0 ? 0 : Math.ceil(ticks / TICK_HZ);
}

// ---------------------------------------------------------------- 하단 메뉴 배지 (M5-7)

export interface MenuBadges {
  /** 도전 배지 '1 가능' / '진행 중' / '' */
  challenge: string;
  /** 도전 배지를 강조할지 (시작할 수 있는 단계가 있음) */
  challengeAlert: boolean;
  /** 강화 배지 'Lv 5' (로컬 플레이어 강화 레벨 합) */
  upgrade: string;
  /** 미션 배지 '2 받기' / '' */
  mission: string;
  missionAlert: boolean;
}

/** 로컬 플레이어의 판 내 강화 레벨 합. */
export function upgradeLevelSum(state: MatchContext['state'], player: number): number {
  let n = 0;
  for (const lv of state.upgrades[player] ?? []) n += lv;
  return n;
}

export function menuBadges(ctx: Pick<MatchContext, 'rules' | 'state'>, tick: number, player: number): MenuBadges {
  const { state } = ctx;
  const ready = challengesAvailable(ctx, tick);
  const claim = missionsClaimable(state);
  return {
    challenge: state.challengeLevel > 0 ? '진행 중' : ready > 0 ? `${ready} 가능` : '',
    challengeAlert: ready > 0,
    upgrade: `Lv ${upgradeLevelSum(state, player)}`,
    mission: claim > 0 ? `${claim} 받기` : '',
    missionAlert: claim > 0,
  };
}

// ---------------------------------------------------------------- ⚔ 도전 시트 (M5-2)

export type ChallengeRowState = 'ready' | 'cooldown' | 'locked' | 'active' | 'busy';

export interface ChallengeRowModel {
  lv: number;
  /** 도전 보스 몹 id (그림) */
  id: string;
  name: string;
  /** '체력 13,068' */
  hp: string;
  /** '+100원' (카드 '황금 손'이 있으면 실제로 받는 돈) */
  reward: string;
  /** 특수 능력 한 줄 (데이터 ability, 마크다운 ** 제거) */
  ability: string;
  state: ChallengeRowState;
  /** 버튼 글자: '시작' · '⏳4:32' · '🔒' · '진행 중' · '대기' */
  label: string;
  /** 이번 판에 한 번이라도 잡았는가 (✅) */
  cleared: boolean;
}

export interface ChallengeSheetModel {
  /** 안내 줄 '단계마다 30초 · 끝나면 그 단계만 5분 쉬어요 · 실패해도 벌칙 없음' (game.json challenge에서) */
  note: string;
  /** 맨 위 진행 줄: '진행 중 · 3단계 돌거북 · 18초' (없으면 '') */
  activeText: string;
  /** 진행 중 도전 남은 초 (없으면 0) — 10초 이하 빨강 */
  activeSec: number;
  rows: ChallengeRowModel[];
}

/** 도전 시트 안내 줄 — 제한 시간·쿨타임은 game.json challenge (M5 검토 반영: 글자에 박지 않는다). */
export function challengeNote(rules: Pick<MatchRules, 'challengeTimeTicks' | 'challengeCooldownTicks'>): string {
  const sec = Math.round(rules.challengeTimeTicks / TICK_HZ);
  const cd = Math.round(rules.challengeCooldownTicks / TICK_HZ);
  const cdText = cd % 60 === 0 ? `${cd / 60}분` : `${cd}초`;
  return `단계마다 ${sec}초 · 끝나면 그 단계만 ${cdText} 쉬어요 · 실패해도 벌칙 없음`;
}

/** 데이터 ability 글자를 한 줄로 (마크다운 **, 앞의 '— ' 정리). */
export function abilityLine(raw: string): string {
  const s = raw.replace(/\*\*/g, '').trim();
  return s.startsWith('—') ? s.replace(/^—\s*/, '') : s;
}

export function challengeSheetModel(
  ctx: Pick<MatchContext, 'rules' | 'state'>,
  tick: number,
  abilities: ReadonlyMap<number, string>,
): ChallengeSheetModel {
  const { state, rules } = ctx;
  const active = state.challengeLevel;
  const activeSec = active > 0 ? secCeil(state.challengeUntil - tick) : 0;
  const rows = rules.challenges.map((c): ChallengeRowModel => {
    const fail = challengeCheck(ctx, c.level, tick);
    let st: ChallengeRowState;
    let label: string;
    if (active === c.level) {
      st = 'active';
      label = '진행 중';
    } else if (fail === null) {
      st = 'ready';
      label = '시작';
    } else if (fail === 'locked') {
      st = 'locked';
      label = '🔒';
    } else if (fail === 'cooldown') {
      st = 'cooldown';
      label = `⏳${formatTimer(challengeCooldownLeft(ctx, c.level, tick))}`;
    } else {
      // busy (다른 도전 진행 중) · phase (패배)
      st = 'busy';
      label = challengeCooldownLeft(ctx, c.level, tick) > 0 ? `⏳${formatTimer(challengeCooldownLeft(ctx, c.level, tick))}` : '대기';
    }
    return {
      lv: c.level,
      id: c.id,
      name: c.name,
      hp: `체력 ${withCommas(c.hp)}`,
      reward: `+${withCommas(goldWithBonus(state, c.reward))}원`,
      ability: abilityLine(abilities.get(c.level) ?? ''),
      state: st,
      label,
      cleared: state.challengeBest >= c.level,
    };
  });
  const cur = active > 0 ? rules.challenges[active - 1] : undefined;
  return {
    note: challengeNote(rules),
    activeText: cur ? `진행 중 · ${cur.level}단계 ${cur.name} · ${activeSec}초` : '',
    activeSec,
    rows,
  };
}

/** 도전 보스 HUD 막대 입력 (UI.md 4.1 '보스·도전 보스가 있을 때만', 9장 '겹치면 체력바 2줄'). 진행 중이 아니면 null. */
export function challengeHudInput(
  ctx: Pick<MatchContext, 'rules' | 'state'>,
  mobs: readonly { id: number; hp: number; challenge: number; link: number }[],
  tick: number,
): { lv: number; name: string; hp: number; maxHp: number; ticksLeft: number } | null {
  const { state, rules } = ctx;
  if (state.challengeLevel <= 0) return null;
  const c = rules.challenges[state.challengeLevel - 1];
  if (!c) return null;
  // 쌍둥이 박쥐는 체력을 같이 쓰므로 한 마리 체력이 무리 체력
  let hp = -1;
  for (const m of mobs) {
    if (m.challenge !== state.challengeLevel) continue;
    if (m.hp > hp) hp = m.hp;
  }
  if (hp < 0) return null;
  return { lv: c.level, name: c.name, hp, maxHp: state.challengeMaxHp, ticksLeft: state.challengeUntil - tick };
}

// ---------------------------------------------------------------- ⬆ 강화 시트 (M5-3·M5-4)

export type UpgradeRowState = 'ok' | 'gold' | 'max' | 'locked';

export interface UpgradeRowModel {
  k: number;
  id: string;
  icon: string;
  name: string;
  /** 대상 설명: 등급 강화 '노말·레어', 능력치·초월 '모든 타워' */
  target: string;
  lv: number;
  max: number;
  /** 'Lv 10/50' (초월은 'Lv 3') */
  levelText: string;
  /** '+40% → +44%' / 최대면 '+200% (최대)' */
  effect: string;
  /** 다음 레벨 비용 (최대면 null) */
  cost: number | null;
  /** 버튼 글자 '600원' / '최대' */
  costText: string;
  state: UpgradeRowState;
}

export interface UpgradeSheetModel {
  /** 맨 위 '⚡×2.6' (지금 공속 배율, 한도까지) */
  apsMul: string;
  /** 능력치 탭 안내 '모든 타워 · 한도: 공속 ×5(초당 15회) · 관통 90% · 치명 100%' (game.json combat에서) */
  statNote: string;
  grade: UpgradeRowModel[];
  stat: UpgradeRowModel[];
  /** 초월 (등급 강화가 모두 최대일 때만, 아니면 null) */
  transcend: UpgradeRowModel | null;
}

/** 강화 효과 단위: 치명타 확률·피해는 %p, 나머지는 %. */
function effectUnit(u: UpgradeRule): string {
  return u.stat === 'critChance' || u.stat === 'critMul' ? '%p' : '%';
}

function upgradeRow(ctx: Pick<MatchContext, 'rules' | 'state'>, player: number, u: UpgradeRule): UpgradeRowModel {
  const lv = upgradeLevel(ctx.state, player, u.k);
  const cost = upgradeCost(ctx.rules, u, lv);
  const fail = upgradeCheck(ctx, player, u.k);
  const unit = effectUnit(u);
  const now = `+${pctText(upgradeEffectBp(u, lv))}${unit}`;
  const effect = cost === null ? `${now} (최대)` : `${now} → +${pctText(upgradeEffectBp(u, lv + 1))}${unit}`;
  const state: UpgradeRowState = fail === null ? 'ok' : fail === 'max' ? 'max' : fail === 'locked' ? 'locked' : 'gold';
  const transcend = u.kind === 'transcend';
  return {
    k: u.k,
    id: u.id,
    icon: u.icon,
    name: u.name,
    target: u.kind === 'grade' ? u.grades.map((g) => GRADE_SHORT[g]).join('·') : '모든 타워',
    lv,
    max: u.max,
    levelText: transcend ? `Lv ${lv}` : `Lv ${lv}/${u.max}`,
    effect,
    cost,
    costText: cost === null ? '최대' : formatGold(cost),
    state,
  };
}

export function upgradeSheetModel(ctx: Pick<MatchContext, 'rules' | 'state'>, player: number): UpgradeSheetModel {
  const { rules, state } = ctx;
  const mods = state.mods[player];
  const aps = BP_ONE + (mods?.apsPctBp ?? 0);
  const cap = rules.apsMaxMul * BP_ONE;
  const grade: UpgradeRowModel[] = [];
  const stat: UpgradeRowModel[] = [];
  let transcend: UpgradeRowModel | null = null;
  for (const u of rules.upgrades) {
    if (u.kind === 'grade') grade.push(upgradeRow(ctx, player, u));
    else if (u.kind === 'stat') stat.push(upgradeRow(ctx, player, u));
    else if (transcendOpen(rules, state, player)) transcend = upgradeRow(ctx, player, u);
  }
  return { apsMul: `⚡${mulText(aps < 0 ? 0 : aps > cap ? cap : aps)}`, statNote: statCapNote(rules), grade, stat, transcend };
}

/** 능력치 강화 한도 안내 — combat 한도 값에서 만든다 (M5 검토 반영: 글자에 박지 않는다). */
export function statCapNote(rules: Pick<MatchRules, 'apsMaxMul' | 'apsMaxMilli' | 'penMaxBp' | 'critChanceMaxBp'>): string {
  const perSec = rules.apsMaxMilli / 1000;
  const perSecText = Number.isInteger(perSec) ? String(perSec) : perSec.toFixed(1);
  return `모든 타워 · 한도: 공속 ×${rules.apsMaxMul}(초당 ${perSecText}회) · 관통 ${pctText(rules.penMaxBp)}% · 치명 ${pctText(rules.critChanceMaxBp)}%`;
}

// ---------------------------------------------------------------- 🎰 도박 탭 (M5-5)

export type GambleTableState = 'ok' | 'gold' | 'locked' | 'debug';

export interface GambleTableModel {
  t: number;
  cost: number;
  /** '1,000원' */
  costText: string;
  /** '0 ~ 5,000원' */
  range: string;
  state: GambleTableState;
  /** 잠김 안내 '🔒 계정 Lv7' (열렸으면 '') */
  lockText: string;
}

export interface GambleSheetModel {
  tables: GambleTableModel[];
  /** 잭팟 게이지 칸 (0~gaugeMax) */
  gauge: number;
  gaugeMax: number;
  /** 다음 도박이 ×3 이상 확정 */
  jackpotReady: boolean;
  /** 게이지가 찼을 때 글자 '다음 ×3 이상!' (game.json gamble.jackpot.minMul) */
  readyText: string;
  /** 배율표 (지금 확률: 도박꾼 ×0 감소·잭팟 반영) */
  odds: { mul: string; pct: string }[];
  /** '기대값 91% (잭팟 포함)' — 잭팟 게이지까지 넣은 실제 기대값 (도박꾼 반영). 잭팟 차례면 '이번 기대값 350%' */
  expectation: string;
  /** 최근 결과 (오래된 것부터) '×2' */
  recent: string[];
}

export function gambleSheetModel(ctx: Pick<MatchContext, 'rules' | 'state' | 'accountLevels'>, world: World | null, player: number): GambleSheetModel {
  const { rules, state } = ctx;
  const g = state.gamble[player] ?? { gauge: 0, recent: [] };
  const maxMulBp = gambleTopMulBp(rules);
  const tables = rules.gambleTables.map((tb, t): GambleTableModel => {
    const fail = gambleCheck(ctx, player, t);
    const unlocked = gambleUnlocked(ctx, player, t);
    const st: GambleTableState = fail === 'locked' ? 'locked' : fail === null ? (unlocked ? 'ok' : 'debug') : 'gold';
    const top = Math.floor((tb.cost * maxMulBp) / BP_ONE);
    return {
      t,
      cost: tb.cost,
      costText: `${withCommas(tb.cost)}원`,
      range: `0 ~ ${withCommas(top)}원`,
      state: st,
      lockText: unlocked ? '' : `🔒 계정 Lv${tb.unlockLevel}`,
    };
  });
  const jackpot = g.gauge >= rules.jackpotGauge;
  const zeroCut = world && !jackpot ? gambleZeroReduction(ctx as MatchContext, world, player) : 0;
  const w = gambleWeights(rules, zeroCut, jackpot);
  const total = w.reduce((a, b) => a + b, 0);
  const odds = rules.gambleOutcomes.map((o, i) => ({
    mul: mulText(o.mulBp),
    pct: `${pctText(total > 0 ? Math.floor(((w[i] as number) * BP_ONE) / total) : 0)}%`,
  }));
  return {
    tables,
    gauge: g.gauge > rules.jackpotGauge ? rules.jackpotGauge : g.gauge,
    gaugeMax: rules.jackpotGauge,
    jackpotReady: jackpot,
    readyText: `다음 ${mulText(rules.jackpotMinMulBp)} 이상!`,
    odds,
    expectation: jackpot
      ? `이번 기대값 ${pctText(Math.floor(gambleRollExpectationBp(rules, 0, true) / 100) * 100)}%`
      : `기대값 ${pctText(Math.floor(gambleExpectationBp(rules, zeroCut) / 100) * 100)}% (잭팟 포함)`,
    recent: g.recent.map((m) => mulText(m)),
  };
}

// ---------------------------------------------------------------- 📋 미션 시트 (M5-6)

export type MissionRowStatus = 'open' | 'done' | 'claimed';

export interface MissionRowModel {
  i: number;
  id: string;
  hidden: boolean;
  /** 이름이 보이는가 (일반은 늘, 히든은 달성했거나 영구 기록) */
  revealed: boolean;
  name: string;
  /** 조건 설명 (이름과 다를 때만 — 발견한 히든·방치·위기 미션, 아니면 '') */
  desc: string;
  cat: string;
  /** '+300원' / '???' (카드 '황금 손'이 있으면 실제로 받는 돈) */
  reward: string;
  /** 진행도 [지금, 목표] */
  progress: [number, number];
  /** '7/10' (진행도로 나타낼 수 없으면 '') */
  progressText: string;
  status: MissionRowStatus;
}

export interface MissionSheetModel {
  normal: MissionRowModel[];
  hidden: MissionRowModel[];
  /** 받을 수 있는 수·실제로 받는 돈 합 ([모두 받기 (n)], 황금 손 반영) */
  claimable: number;
  claimableTotal: number;
  /** 탭 아래 요약 '달성 12/30' · '발견 2/11' */
  normalSummary: string;
  hiddenSummary: string;
}

function statusOf(s: number | undefined): MissionRowStatus {
  return s === MISSION_DONE ? 'done' : s === MISSION_CLAIMED ? 'claimed' : 'open';
}

const STATUS_ORDER: Readonly<Record<MissionRowStatus, number>> = { done: 0, open: 1, claimed: 2 };

/** 받을 수 있는 것 → 진행 중 → 받은 것 (같은 묶음 안은 미션 번호 순). */
export function sortMissionRows(rows: MissionRowModel[]): MissionRowModel[] {
  return [...rows].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.i - b.i);
}

export function missionSheetModel(
  ctx: Pick<MatchContext, 'rules' | 'state'>,
  world: World,
  hiddenFound: ReadonlySet<string>,
): MissionSheetModel {
  const { rules, state } = ctx;
  const census = towerCensus(world);
  const normal: MissionRowModel[] = [];
  const hidden: MissionRowModel[] = [];
  let claimableTotal = 0;
  let normalDone = 0;
  let hiddenSeen = 0;
  rules.missions.forEach((m, i) => {
    const st = state.missionStatus[i];
    const status = statusOf(st);
    const revealed = !m.hidden || status !== 'open' || hiddenFound.has(m.id);
    const progress = missionProgress(ctx, world, i, census);
    const measurable = progress[1] > 1 || m.cond.type === 'stat' || m.cond.type === 'gamble';
    const row: MissionRowModel = {
      i,
      id: m.id,
      hidden: m.hidden,
      revealed,
      name: revealed ? m.name : '???',
      desc: revealed && m.desc && m.desc !== m.name ? m.desc : '',
      cat: revealed ? m.cat : '히든',
      reward: revealed ? `+${withCommas(goldWithBonus(state, m.reward))}원` : '???',
      // 발견 전 히든은 진행도도 숨긴다 (조건을 짐작할 수 없게)
      progress: revealed ? progress : [0, 1],
      progressText: revealed && measurable ? `${withCommas(progress[0])}/${withCommas(progress[1])}` : '',
      status,
    };
    if (status === 'done') claimableTotal += goldWithBonus(state, m.reward);
    if (m.hidden) {
      if (revealed) hiddenSeen++;
      hidden.push(row);
    } else {
      if (st !== MISSION_OPEN) normalDone++;
      normal.push(row);
    }
  });
  return {
    normal: sortMissionRows(normal),
    hidden: sortMissionRows(hidden),
    claimable: missionsClaimable(state),
    claimableTotal,
    normalSummary: `달성 ${normalDone}/${normal.length}`,
    hiddenSummary: `발견 ${hiddenSeen}/${hidden.length}`,
  };
}

/** 미션 탭 이름 (UI.md 4.5 '[일반 30] [히든 ???]'). */
export function missionTabLabels(rules: Pick<MatchRules, 'missions'>): Record<MissionTab, string> {
  const n = rules.missions.filter((m) => !m.hidden).length;
  return { normal: `일반 ${n}`, hidden: '히든 ???' };
}
