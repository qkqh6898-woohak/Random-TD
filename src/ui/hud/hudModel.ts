/**
 * HUD 표시값 계산 (순수 함수, DOM 없음 → 단위 테스트로 "값이 sim과 일치"를 확인한다).
 * UI.md 4.1·4.2: 1줄 = 단계·타이머·몹 수(무한)/목숨(캠페인)·⏸, 2줄 = 돈·배속.
 * 아래 띠 (M2): 놓인 타워 수/배치 칸 수 · 소환 안내 (돈이 모자라면 빨간색).
 * M3: 아래 띠 '⬆ 승급 가능 n' 버튼은 피드백 #65에서 없앴다 — 승급은 맵 오른쪽 위 [⏫ 모두 승급 n] 하나 (Hud.setMergeAll).
 * M4: 2줄에 '👷 3/10' (최대면 금색), 아래 띠에 [👷 300원] 일꾼 고용 버튼 (최대면 '👷 최대'), 보스 막대 = 이름표 + 체력 채움 + 남은 초
 *   (UI.md 4.1 '[보스: 박쥐 여왕 ▓▓▓▓░░ 38초]', 10초 이하 빨강). 보스를 잡은 보스 단계는 '보스 처치! 남은 시간은 휴식'.
 * M5: 도전 보스 막대 (UI.md 4.1 '보스·도전 보스가 있을 때만', 9장 '보스 단계와 도전이 겹치면 체력바 2줄' — 같은 자리를 반씩 나눈다),
 *   하단 메뉴 배지 '⚔ 도전 1 가능' · '⬆ 강화 Lv 5' · '📋 미션 2 받기' (UI.md 4.1, sheets/sheetModels.menuBadges).
 */
import { BOSS_CLEARED, bossCounterTip, bossFlyLabel, bossHpLeftPct, bossNameplate, bossTag, bossTimeoutText, challengeNameplate, withCommas } from '../messages';
import type { HudConfig } from '../../data/load';
import type { Mob } from '../../sim/entities/Mob';
import type { Deck, MatchRules } from '../../sim/rules';
import { DECK_GRADES } from '../../data/deck';
import type { MatchState } from '../../sim/state';
import { TICK_HZ } from '../../sim/World';
import { TILE } from '../../sim/Fixed';

export interface HudInput {
  state: Readonly<MatchState>;
  /** 다음 단계까지 남은 틱 */
  ticksLeft: number;
  mobCount: number;
  tick: number;
  speed: number;
  /** 판 위 타워 수 (생략하면 0) */
  towerCount?: number;
  /** 배치 칸 수 (생략하면 0) */
  buildableCount?: number;
  /** 소환 비용 (생략하면 0) */
  summonCost?: number;
  /** 승급할 수 있는 묶음 수 (생략하면 0) — 있으면 아래 띠 소환 안내를 비운다 */
  mergeReady?: number;
  /** 일꾼 최대 수·고용 비용 (생략하면 일꾼 표시 없음 = 0/0) */
  workerMax?: number;
  workerCost?: number;
  /** 살아 있는 보스 (이름·이름표 앞부분·조각 체력 합·처음 체력, 남은 제한 틱). 없으면 null */
  boss?: { name: string; tag: string; hp: number; maxHp: number; ticksLeft: number; flyRange?: number } | null;
  /** 진행 중인 도전 보스 (단계·이름·체력·처음 체력·남은 제한 틱, M5-2). 없으면 null */
  challenge?: { lv: number; name: string; hp: number; maxHp: number; ticksLeft: number } | null;
  /** 하단 메뉴 배지 (M5-7). 생략하면 빈 배지 */
  menu?: { challenge: string; challengeAlert: boolean; upgrade: string; mission: string; missionAlert: boolean };
}

export interface HudModel {
  stage: string;
  /** G-1 위 HUD 가운데 'WAVE n' (무한) · 캠페인은 '1-5' · 준비 '준비' (보스 단계 👑는 Hud가 앞에 붙인다) */
  wave: string;
  /** G-1 몹 수 막대 채움 (천분율 0~1000): 무한 = 몹 수 ÷ 한도, 캠페인 = 목숨 ÷ 최대 목숨 */
  countFill: number;
  boss: boolean;
  /** 남은 시간 m:ss */
  timer: string;
  timerWarn: boolean;
  /** 무한: 몹 수, 캠페인: 목숨 */
  countKind: 'mobs' | 'lives';
  count: string;
  /** 빨간색 (몹 120 이상 / 목숨 5 이하) */
  countWarn: boolean;
  /** 깜빡임 — 몹 수 경고만 (UI.md 4.2: 목숨은 빨간색만) */
  countBlink: boolean;
  /** 화면 가장자리 붉은 테두리 — 무한 모드 몹 120 이상 */
  edgeWarn: boolean;
  gold: string;
  speed: string;
  /** 보스 막대 글자 (보스 단계가 아니면 null): 살아 있으면 이름표, 잡았으면 '보스 처치!' */
  bossBanner: string | null;
  /** 보스 체력 채움 (천분율 0~1000, 막대가 없으면 −1) */
  bossHp: number;
  /** 보스 남은 시간 '38초' (보스가 없으면 '') */
  bossTime: string;
  /** 보스 남은 10초 이하 (빨간 깜빡, ENEMIES.md 8장) */
  bossTimeWarn: boolean;
  /** 보스 막대 아래 짧은 표시 (F10-2): 박쥐 여왕이 날 때 '🦇 비행 중 · 사거리 2칸 이하 공격 불가', 아니면 '' */
  bossNote: string;
  /** 일꾼 '3/10' */
  workers: string;
  /** 일꾼 최대 (금색) */
  workersFull: boolean;
  /** 고용 버튼 글자 '👷 300원' / '👷 최대' */
  hireLabel: string;
  /** 고용할 수 있는가 (돈 있음 + 최대 아님, 아니면 버튼이 흐림) */
  hireReady: boolean;
  tick: number;
  /** 놓인 타워 수 / 배치 칸 수 */
  towers: string;
  /** 소환 안내 글자 (T-2부터 칸이 가득 찼을 때 '빈 칸이 없어요'만 — 비용은 [🎲 소환] 버튼이 보여 준다) */
  summonHint: string;
  /** [🎲 소환 100원] 버튼의 비용 글자 '100원' (T-2) */
  summonCost: string;
  /** 소환할 돈이 있는가 (없으면 안내가 빨간색) */
  summonAffordable: boolean;
  /** 도전 보스 막대 글자 '⚔ 도전 3단계 「돌거북」' (도전 중이 아니면 null) */
  challengeBanner: string | null;
  /** 도전 보스 체력 채움 (천분율, 막대가 없으면 −1) */
  challengeHp: number;
  /** 도전 남은 시간 '18초' */
  challengeTime: string;
  /** 도전 남은 10초 이하 (빨간 깜빡) */
  challengeTimeWarn: boolean;
  /** 하단 메뉴 배지 */
  menuChallenge: string;
  menuChallengeAlert: boolean;
  menuUpgrade: string;
  menuMission: string;
  menuMissionAlert: boolean;
}

/** 남은 틱 → m:ss (올림: 0.1초 남아도 0:01). */
export function formatTimer(ticksLeft: number): string {
  const sec = ticksLeft <= 0 ? 0 : Math.ceil(ticksLeft / TICK_HZ);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 세 자리마다 쉼표 — 알림 문구도 같이 쓰도록 messages.ts에 있다 (여기서 다시 내보낸다). */
export { withCommas };

/**
 * 돈 옆 '+n원' 글자들 (피드백 #45): 들어온 돈 하나에 글자 하나 — 합치지 않는다.
 * 한 번에 max개보다 많으면 가장 최근 max개만.
 */
export function goldGainLabels(amounts: readonly number[], max: number): string[] {
  return amounts
    .filter((a) => a > 0)
    .slice(-max)
    .map((a) => `+${withCommas(a)}원`);
}

/** 소수 한 자리, 끝의 .0은 뺀다 (내림 — 실제보다 많아 보이지 않게). */
function oneDecimal(v: number): string {
  const t = Math.floor(v * 10) / 10;
  return Number.isInteger(t) ? String(t) : t.toFixed(1);
}

/** 돈 표시 (UI.md 4.2: 1만 이상 축약). 1,240원 / 1.2만원 / 3.4억원. */
export function formatGold(n: number): string {
  if (n < 10_000) return `${withCommas(n)}원`;
  if (n < 100_000_000) return `${oneDecimal(n / 10_000)}만원`;
  return `${oneDecimal(n / 100_000_000)}억원`;
}

/** 단계 이름: 무한 `5단계` / 캠페인 `1-5`, 0단계는 '준비'. */
export function formatStage(state: Pick<MatchState, 'mode' | 'theme' | 'stage'>): string {
  if (state.mode === 'campaign') return state.stage === 0 ? `${state.theme}-준비` : `${state.theme}-${state.stage}`;
  return state.stage === 0 ? '준비' : `${state.stage}단계`;
}

/** G-1 위 HUD 단계 글자: 무한 'WAVE n' · 준비 '준비' · 캠페인은 예전 그대로 '1-5'. */
export function waveLabel(state: Pick<MatchState, 'mode' | 'theme' | 'stage'>): string {
  if (state.mode === 'campaign') return formatStage(state);
  return state.stage === 0 ? '준비' : `WAVE ${state.stage}`;
}

export function buildHudModel(input: HudInput, cfg: HudConfig): HudModel {
  const { state } = input;
  const campaign = state.mode === 'campaign';
  const secLeft = input.ticksLeft <= 0 ? 0 : Math.ceil(input.ticksLeft / TICK_HZ);
  const mobWarn = !campaign && input.mobCount >= cfg.mobWarnCount;
  const workerMax = input.workerMax ?? 0;
  const workerCost = input.workerCost ?? 0;
  const workersFull = workerMax > 0 && state.workers >= workerMax;
  return {
    stage: formatStage(state),
    wave: waveLabel(state),
    countFill: campaign
      ? state.maxLives > 0
        ? Math.max(0, Math.min(1000, Math.floor((state.lives * 1000) / state.maxLives)))
        : 0
      : state.mobLimit > 0
        ? Math.min(1000, Math.floor((input.mobCount * 1000) / state.mobLimit))
        : 0,
    boss: state.bossStage,
    timer: formatTimer(input.ticksLeft),
    timerWarn: secLeft <= cfg.timerWarnSeconds,
    countKind: campaign ? 'lives' : 'mobs',
    count: campaign ? String(state.lives) : `${input.mobCount}/${state.mobLimit}`,
    countWarn: campaign ? state.lives <= cfg.livesWarn : mobWarn,
    countBlink: mobWarn,
    edgeWarn: mobWarn,
    gold: formatGold(state.gold),
    speed: `×${input.speed}`,
    ...bossBar(state.bossStage, input.boss ?? null, cfg),
    tick: input.tick,
    ...summonInfo(state.gold, input.towerCount ?? 0, input.buildableCount ?? 0, input.summonCost ?? 0, (input.mergeReady ?? 0) > 0),
    workers: `${state.workers}/${workerMax}`,
    workersFull,
    hireLabel: workersFull ? '👷 최대' : `👷 ${withCommas(workerCost)}원`,
    hireReady: !workersFull && state.gold >= workerCost,
    ...challengeBar(input.challenge ?? null, cfg),
    menuChallenge: input.menu?.challenge ?? '',
    menuChallengeAlert: input.menu?.challengeAlert ?? false,
    menuUpgrade: input.menu?.upgrade ?? '',
    menuMission: input.menu?.mission ?? '',
    menuMissionAlert: input.menu?.missionAlert ?? false,
  };
}

/** 도전 보스 막대 (M5-2): 이름표 + 체력 천분율 + 남은 초. 도전 중이 아니면 없음. */
export function challengeBar(
  c: HudInput['challenge'],
  cfg: Pick<HudConfig, 'timerWarnSeconds'>,
): Pick<HudModel, 'challengeBanner' | 'challengeHp' | 'challengeTime' | 'challengeTimeWarn'> {
  if (!c) return { challengeBanner: null, challengeHp: -1, challengeTime: '', challengeTimeWarn: false };
  const sec = c.ticksLeft <= 0 ? 0 : Math.ceil(c.ticksLeft / TICK_HZ);
  const permille = c.maxHp > 0 ? Math.max(0, Math.min(1000, Math.ceil((c.hp * 1000) / c.maxHp))) : 0;
  return { challengeBanner: challengeNameplate(c.lv, c.name), challengeHp: permille, challengeTime: `${sec}초`, challengeTimeWarn: sec <= cfg.timerWarnSeconds };
}

/**
 * 덱에 든 감지 타워 이름 (투명 몹 경고 둘째 줄, 검토 반영): 덱 등급 순(노말 → 레전드)·덱 안 순서, towers.json detect가 'none'이 아닌 것.
 */
export function deckDetectNames(deck: Deck, towers: readonly { id: string; name: string; detect?: string }[]): string[] {
  const byId = new Map(towers.map((t) => [t.id, t]));
  const out: string[] = [];
  for (const g of DECK_GRADES) {
    for (const id of deck[g] ?? []) {
      const t = byId.get(id);
      if (t && t.detect !== undefined && t.detect !== 'none') out.push(t.name);
    }
  }
  return out;
}

/**
 * 군단 id → 이름 (보스 이름표 앞부분): enemies.json hierarchy.legions[].name + 군주 직속(hierarchy.lord.guardName, id 'lord').
 * 이름이 없으면 id 그대로. 코드에 군단 이름을 박지 않는다 (검토 반영).
 */
export function legionNameMap(hierarchy: Readonly<Record<string, unknown>>): Record<string, string> {
  const h = hierarchy as { lord?: { guardName?: string }; legions?: Record<string, { name?: string }> };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h.legions ?? {})) out[k] = v.name ?? k;
  out.lord = h.lord?.guardName ?? 'lord';
  return out;
}

/**
 * 살아 있는 보스의 HUD 입력 (보스 막대): 이름·이름표 앞부분('질풍 군단 · 대장')·조각 체력 합·처음 체력·남은 제한 틱.
 * 보스가 없으면 null. 군단 이름은 legionNameMap (enemies.json hierarchy).
 */
export function bossHudInput(
  rules: Pick<MatchRules, 'bosses'>,
  legionNames: Readonly<Record<string, string>>,
  state: Pick<MatchState, 'bossId' | 'bossMaxHp' | 'bossDeadline'>,
  mobs: readonly (Pick<Mob, 'boss' | 'hp' | 'challenge'> & Partial<Pick<Mob, 'flyUntil' | 'flyBlock'>>)[],
  tick: number,
): HudInput['boss'] {
  if (state.bossId === '') return null;
  const b = rules.bosses.get(state.bossId);
  let hp = 0;
  let alive = false;
  let fly = 0;
  for (const m of mobs) {
    // 도전 보스(M5-2)도 boss 취급이지만 판의 보스 막대에는 넣지 않는다 (자기 막대가 따로 — M5 검토 반영)
    if (!m.boss || m.challenge) continue;
    alive = true;
    hp += m.hp > 0 ? m.hp : 0;
    // F10-2: 날아오른 동안 (박쥐 여왕) — 막는 사거리(단위)를 칸으로
    if ((m.flyUntil ?? 0) > tick && (m.flyBlock ?? 0) > fly) fly = m.flyBlock ?? 0;
  }
  if (!alive || !b) return null;
  const legion = legionNames[b.legion] ?? b.legion;
  return {
    name: b.name,
    tag: bossTag(legion, b.rank),
    hp,
    maxHp: state.bossMaxHp,
    ticksLeft: state.bossDeadline - tick,
    ...(fly > 0 ? { flyRange: fly / TILE } : {}),
  };
}

/** 보스 막대 (UI.md 4.1): 살아 있는 보스 = 이름표 + 체력 천분율 + 남은 초, 보스 단계인데 보스가 없으면 '처치!', 아니면 없음. */
export function bossBar(
  bossStage: boolean,
  boss: HudInput['boss'],
  cfg: Pick<HudConfig, 'timerWarnSeconds'>,
): Pick<HudModel, 'bossBanner' | 'bossHp' | 'bossTime' | 'bossTimeWarn' | 'bossNote'> {
  if (boss) {
    const sec = boss.ticksLeft <= 0 ? 0 : Math.ceil(boss.ticksLeft / TICK_HZ);
    const permille = boss.maxHp > 0 ? Math.max(0, Math.min(1000, Math.ceil((boss.hp * 1000) / boss.maxHp))) : 0;
    return {
      bossBanner: bossNameplate(boss.tag, boss.name),
      bossHp: permille,
      bossTime: `${sec}초`,
      bossTimeWarn: sec <= cfg.timerWarnSeconds,
      bossNote: boss.flyRange && boss.flyRange > 0 ? bossFlyLabel(boss.flyRange) : '',
    };
  }
  if (bossStage) return { bossBanner: BOSS_CLEARED, bossHp: -1, bossTime: '', bossTimeWarn: false, bossNote: '' };
  return { bossBanner: null, bossHp: -1, bossTime: '', bossTimeWarn: false, bossNote: '' };
}

/**
 * 아래 띠: 타워 수와 소환 안내 (UI.md 4.3 '빈 배치 칸 터치 = 즉시 소환').
 * M4: 같은 줄에 [👷 300원] 고용 버튼이 생겨 안내는 늘 짧게 '소환 · 100원' (M2의 '빈 칸을 눌러 소환 · 100원'은 412px에서 잘린다).
 * @param short 승급할 무더기가 있을 때 (피드백 #65 전에는 아래 띠 [⬆ 승급 가능 n], 지금은 맵 오른쪽 위 [⏫ 모두 승급 n]): 안내를 비운다 — 고용·승급 버튼과 같은 줄이라 '소환 · 100원'도 잘린다
 *   (승급 버튼 자체가 할 일을 알려 준다). 칸이 가득 찼을 때도 같다: '빈 칸이 없어요'는 승급 버튼이 없을 때만
 *   (검토 반영 — 가득 찬 판 후반에 '빈 칸…'으로 잘렸다. 가득 찬 것은 옆의 '71/71'이 보여 준다)
 * T-2: 같은 줄에 [🎲 소환 100원] 버튼(누르면 소환, 꾹 누르면 계속)이 생겨 '소환 · 100원' 안내는 뺐다 — 비용은 버튼 글자(summonCost).
 */
export function summonInfo(
  gold: number,
  towerCount: number,
  buildableCount: number,
  cost: number,
  short = false,
): Pick<HudModel, 'towers' | 'summonHint' | 'summonAffordable' | 'summonCost'> {
  const full = buildableCount > 0 && towerCount >= buildableCount;
  return {
    towers: `${towerCount}/${buildableCount}`,
    summonHint: short ? '' : full ? '빈 칸이 없어요' : '',
    summonCost: `${withCommas(cost)}원`,
    summonAffordable: !full && gold >= cost,
  };
}

/** 목숨이 줄었는가 → 하트 깨짐 연출 (UI.md 4.2). 앞뒤 모두 목숨 표시(캠페인)일 때만 비교한다. */
export function livesDropped(prev: Partial<Pick<HudModel, 'countKind' | 'count'>>, next: Pick<HudModel, 'countKind' | 'count'>): boolean {
  if (prev.countKind !== 'lives' || next.countKind !== 'lives' || prev.count === undefined) return false;
  return Number(next.count) < Number(prev.count);
}

/** 보스 제한 시간 패배 때 패배 화면이 쓰는 보스 정보 (F10-2): 이름·남은 체력·처음 체력·제한 초·대응 한 줄. */
export interface DefeatBossInfo {
  name: string;
  hp: number;
  maxHp: number;
  seconds: number;
  counter: string;
}

/**
 * 패배 화면 글자. 보스 제한 시간 패배에 보스 정보가 있으면 (F10-2, 사용자 결정 1)
 * reason = '박쥐 여왕을 60초 안에 잡지 못했어요 · 남은 체력 34%', tip = '💡 (보스 대응 한 줄)'.
 */
export function defeatText(
  state: Pick<MatchState, 'mode' | 'theme' | 'stage' | 'defeatReason' | 'mobLimit'>,
  boss: DefeatBossInfo | null = null,
): {
  reason: string;
  record: string;
  tip: string;
} {
  const where = formatStage(state);
  const reason =
    state.defeatReason === 'mobLimit'
      ? `${where}에서 몹이 ${state.mobLimit}마리를 넘었어요`
      : state.defeatReason === 'lives'
        ? `${where}에서 목숨을 모두 잃었어요`
        : state.defeatReason === 'bossTime'
          ? boss
            ? bossTimeoutText(boss.name, boss.seconds, bossHpLeftPct(boss.hp, boss.maxHp))
            : `${where} 보스를 제한 시간 안에 잡지 못했어요`
          : state.defeatReason === 'bossLeak'
            ? `${where} 보스가 성문에 닿았어요`
            : `${where}에서 판이 끝났어요`;
  const record = state.mode === 'campaign' ? `테마 ${state.theme} · ${state.stage}단계까지` : `${state.stage}단계까지 버텼어요`;
  const tip = boss && (state.defeatReason === 'bossTime' || state.defeatReason === 'bossLeak') && boss.counter ? bossCounterTip(boss.counter) : '';
  return { reason, record, tip };
}

/** 단계 시작 알림 글자 (토스트). */
export function stageToastText(state: Pick<MatchState, 'mode' | 'theme' | 'stage' | 'bossStage'>): string {
  const label = formatStage(state);
  return state.bossStage ? `👑 ${label} 보스 단계!` : `${label} 시작!`;
}
