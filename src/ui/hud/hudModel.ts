/**
 * HUD 표시값 계산 (순수 함수, DOM 없음 → 단위 테스트로 "값이 sim과 일치"를 확인한다).
 * UI.md 4.1·4.2: 1줄 = 단계·타이머·몹 수(무한)/목숨(캠페인)·⏸, 2줄 = 돈·배속.
 * 아래 띠 (M2): 놓인 타워 수/배치 칸 수 · 소환 안내 (돈이 모자라면 빨간색). 일꾼·승급·하단 메뉴는 M4·M3·M5.
 */
import type { HudConfig } from '../../data/load';
import type { MatchState } from '../../sim/state';
import { TICK_HZ } from '../../sim/World';

export interface HudInput {
  state: Readonly<MatchState>;
  /** 다음 단계까지 남은 틱 */
  ticksLeft: number;
  mobCount: number;
  tick: number;
  speed: number;
  /** 캠페인 테마 보스 배치표 (단계 → 보스 이름). 무한 모드는 없음 */
  bossNames?: Readonly<Record<string, string>>;
  /** 판 위 타워 수 (생략하면 0) */
  towerCount?: number;
  /** 배치 칸 수 (생략하면 0) */
  buildableCount?: number;
  /** 소환 비용 (생략하면 0) */
  summonCost?: number;
}

export interface HudModel {
  stage: string;
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
  /** 보스 단계 배너 (아니면 null) */
  bossBanner: string | null;
  tick: number;
  /** 놓인 타워 수 / 배치 칸 수 */
  towers: string;
  /** 소환 안내 글자 */
  summonHint: string;
  /** 소환할 돈이 있는가 (없으면 안내가 빨간색) */
  summonAffordable: boolean;
}

/** 남은 틱 → m:ss (올림: 0.1초 남아도 0:01). */
export function formatTimer(ticksLeft: number): string {
  const sec = ticksLeft <= 0 ? 0 : Math.ceil(ticksLeft / TICK_HZ);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 세 자리마다 쉼표 (기기 로케일과 상관없이 같게). */
export function withCommas(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.abs(Math.trunc(n)));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return sign + out;
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

export function buildHudModel(input: HudInput, cfg: HudConfig): HudModel {
  const { state } = input;
  const campaign = state.mode === 'campaign';
  const secLeft = input.ticksLeft <= 0 ? 0 : Math.ceil(input.ticksLeft / TICK_HZ);
  const bossName = input.bossNames?.[String(state.stage)];
  const mobWarn = !campaign && input.mobCount >= cfg.mobWarnCount;
  return {
    stage: formatStage(state),
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
    bossBanner: state.bossStage ? `👑 보스 단계${bossName ? ` · ${bossName}` : ''} — 보스 준비 중` : null,
    tick: input.tick,
    ...summonInfo(state.gold, input.towerCount ?? 0, input.buildableCount ?? 0, input.summonCost ?? 0),
  };
}

/** 아래 띠: 타워 수와 소환 안내 (UI.md 4.3 '빈 배치 칸 터치 = 즉시 소환'). */
export function summonInfo(
  gold: number,
  towerCount: number,
  buildableCount: number,
  cost: number,
): Pick<HudModel, 'towers' | 'summonHint' | 'summonAffordable'> {
  const full = buildableCount > 0 && towerCount >= buildableCount;
  return {
    towers: `${towerCount}/${buildableCount}`,
    summonHint: full ? '빈 칸이 없어요' : `빈 칸을 눌러 소환 · ${withCommas(cost)}원`,
    summonAffordable: !full && gold >= cost,
  };
}

/** 목숨이 줄었는가 → 하트 깨짐 연출 (UI.md 4.2). 앞뒤 모두 목숨 표시(캠페인)일 때만 비교한다. */
export function livesDropped(prev: Partial<Pick<HudModel, 'countKind' | 'count'>>, next: Pick<HudModel, 'countKind' | 'count'>): boolean {
  if (prev.countKind !== 'lives' || next.countKind !== 'lives' || prev.count === undefined) return false;
  return Number(next.count) < Number(prev.count);
}

/** 패배 화면 글자. */
export function defeatText(state: Pick<MatchState, 'mode' | 'theme' | 'stage' | 'defeatReason' | 'mobLimit'>): {
  reason: string;
  record: string;
} {
  const where = formatStage(state);
  const reason =
    state.defeatReason === 'mobLimit'
      ? `${where}에서 몹이 ${state.mobLimit}마리를 넘었어요`
      : state.defeatReason === 'lives'
        ? `${where}에서 목숨을 모두 잃었어요`
        : `${where}에서 판이 끝났어요`;
  const record = state.mode === 'campaign' ? `테마 ${state.theme} · ${state.stage}단계까지` : `${state.stage}단계까지 버텼어요`;
  return { reason, record };
}

/** 단계 시작 알림 글자 (토스트). */
export function stageToastText(state: Pick<MatchState, 'mode' | 'theme' | 'stage' | 'bossStage'>): string {
  const label = formatStage(state);
  return state.bossStage ? `👑 ${label} 보스 단계!` : `${label} 시작!`;
}
