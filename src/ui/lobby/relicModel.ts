/**
 * V3 P2 유물 진열장 화면 모델 (순수 — docs/v3/ui-contract.md P2). 자격·가격·잠금은 메타 규칙(src/meta/v3/relics.ts) 한 곳에서 계산한다.
 * 그림: 시범 3종(숫돌·저금통·서리 결정)과 열쇠만 WebP, 나머지 9종은 코드 도형 임시 아이콘(역할별 모양 + 이름 첫 글자).
 */
import type { GameData, RelicConfig } from '../../data/load';
import type { ProgressState } from '../../meta/progress';
import type { ProgressionData } from '../../meta/progressionData';
import { relicValue } from '../../sim/relics';
import { buildMatchRules } from '../../sim/rules';
import {
  checkRelicUpgrade,
  firstRelicAvailable,
  pityRemaining,
  relicEntry,
  relicUpgradeCost,
  type UpgradeCheck,
} from '../../meta/v3/relics';

/** 시범 그림이 있는 유물 (기획 ID → 파일). 견적 요청 ID relic-smith-whetstone = 기획 ID relic-whetstone */
export const RELIC_ART: Readonly<Record<string, string>> = Object.freeze({
  'relic-whetstone': 'assets/v3/pilot/relic-whetstone.webp',
  'relic-acorn-bank': 'assets/v3/pilot/relic-acorn-bank.webp',
  'relic-frost-crystal': 'assets/v3/pilot/relic-frost-crystal.webp',
});
export const KEY_ART = 'assets/v3/pilot/currency-explorer-key.webp';

export const ROLE_NAMES: Readonly<Record<RelicConfig['role'], string>> = Object.freeze({ combat: '전투', economy: '경제 보조', relief: '실패 완화', utility: '유틸', control: '제어' });

const pct = (bp: number): string => {
  const v = bp / 100;
  return `${Number.isInteger(v) ? v : Number.isInteger(v * 10) ? v.toFixed(1) : v.toFixed(2)}%`;
};
const won = (n: number): string => `${n.toLocaleString('ko-KR')}원`;

let rulesCache: { data: unknown; rules: ReturnType<typeof buildMatchRules> } | null = null;
function relicRules(data: GameData) {
  if (!rulesCache || rulesCache.data !== data) rulesCache = { data, rules: buildMatchRules(data) };
  return rulesCache.rules.relics;
}

/** Lv level의 효과 글 (Lv 0 = Lv1 효과 미리 보기) */
export function relicEffectText(data: GameData, id: string, level: number): string {
  const rule = relicRules(data).get(id);
  if (!rule) return '';
  const v = relicValue(rule, Math.max(1, level));
  switch (rule.effect) {
    case 'atkPct':
      return `모든 영웅 공격력 +${pct(v)}`;
    case 'apsPct':
      return `모든 영웅 공격 속도 +${pct(v)}`;
    case 'bossPct':
      return `보스에게 주는 피해 +${pct(v)}`;
    case 'physPct':
      return `물리·혼합 영웅 공격력 +${pct(v)}`;
    case 'magicPct':
      return `마법·혼합 영웅 공격력 +${pct(v)}`;
    case 'goldAtk':
      return `가진 돈 1,000원마다 공격력 +${pct(v)} (최대 +${pct(rule.capBp)})`;
    case 'ccPct':
      return `거는 둔화·빙결·정지 시간 +${pct(v)}`;
    case 'interestCap':
      return `단계 이자 한 번 상한 +${won(v)} · 100원마다 이자 +${rule.rateBonus}원`;
    case 'startGold':
      return `판 시작 돈 +${won(v)}`;
    case 'workerIncome':
      return `일꾼 1명당 수입 +${won(v)}`;
    case 'gambleRefund':
      return `도박 꽝(×0)이면 건 돈의 ${pct(v)} 돌려받기`;
    case 'leakLimit':
      return `몹 한도(무한)·목숨(캠페인) +${v}`;
  }
}

export interface RelicCardModel {
  id: string;
  name: string;
  role: string;
  roleKey: RelicConfig['role'];
  /** 이름 첫 글자 (임시 아이콘) */
  glyph: string;
  art: string | null;
  level: number;
  maxLevel: number;
  owned: boolean;
  fragments: number;
  /** 다음 강화에 드는 조각 (만렙·미보유면 null) */
  need: number | null;
  ready: boolean;
  isTarget: boolean;
  isMax: boolean;
}

export interface RelicDetailModel extends RelicCardModel {
  effectNow: string;
  effectNext: string | null;
  cost: { fragments: number; gold: number } | null;
  check: UpgradeCheck;
  goldShort: boolean;
  fragShort: boolean;
}

export interface RelicShowcaseModel {
  keys: number;
  gold: number;
  firstPick: boolean;
  target: RelicCardModel | null;
  targetBank: number;
  /** 다음 보장까지 남은 발견 (1 = 다음이 보장) */
  pityLeft: number;
  pityEvery: number;
  poolSize: number;
  cards: RelicCardModel[];
  /** 지금 강화할 수 있는 유물 수 (배지) */
  readyCount: number;
  exchangeRate: number;
}

function card(state: ProgressState, pd: ProgressionData, data: GameData, cfg: RelicConfig): RelicCardModel {
  const e = relicEntry(state.v3, cfg.id);
  const cost = relicUpgradeCost(pd, e.level, cfg.maxLevel);
  return {
    id: cfg.id,
    name: cfg.name,
    role: ROLE_NAMES[cfg.role],
    roleKey: cfg.role,
    glyph: cfg.name.slice(0, 1),
    art: RELIC_ART[cfg.id] ?? null,
    level: e.level,
    maxLevel: cfg.maxLevel,
    owned: e.level >= 1,
    fragments: e.fragments,
    need: e.level >= 1 && cost ? cost.fragments : null,
    ready: checkRelicUpgrade(state.v3, pd, data, state.gold, cfg.id) === 'ok',
    isTarget: state.v3.target === cfg.id,
    isMax: e.level >= cfg.maxLevel,
  };
}

/** 공개 풀 순서의 유물 데이터 (미공개는 넣지 않는다) */
export function poolConfigs(pd: ProgressionData, data: GameData): RelicConfig[] {
  return pd.v3.relics.pool.map((id) => data.game.relics.find((r) => r.id === id)).filter((r): r is RelicConfig => r !== undefined);
}

export function relicShowcase(state: ProgressState, pd: ProgressionData, data: GameData): RelicShowcaseModel {
  const cards = poolConfigs(pd, data).map((c) => card(state, pd, data, c));
  return {
    keys: state.v3.keys,
    gold: state.gold,
    firstPick: firstRelicAvailable(state.v3, pd),
    target: cards.find((c) => c.isTarget) ?? null,
    targetBank: state.v3.targetBank,
    pityLeft: pityRemaining(state.v3, pd),
    pityEvery: pd.v3.relics.pityEvery,
    poolSize: cards.length,
    cards,
    readyCount: cards.filter((c) => c.ready).length,
    exchangeRate: pd.v3.relics.exchangeRate,
  };
}

export function relicDetail(state: ProgressState, pd: ProgressionData, data: GameData, id: string): RelicDetailModel | null {
  const cfg = data.game.relics.find((r) => r.id === id);
  if (!cfg) return null;
  const c = card(state, pd, data, cfg);
  const cost = relicUpgradeCost(pd, c.level, cfg.maxLevel);
  const check = checkRelicUpgrade(state.v3, pd, data, state.gold, id);
  return {
    ...c,
    effectNow: relicEffectText(data, id, c.level),
    effectNext: c.owned && !c.isMax ? relicEffectText(data, id, c.level + 1) : null,
    cost: c.owned ? cost : null,
    check,
    goldShort: check === 'gold',
    fragShort: check === 'fragments',
  };
}

/** 로비 [유물] 버튼 배지: 강화 가능 수 + 첫 유물 선택권 (실제로 할 수 있는 것만) */
export function relicBadge(state: ProgressState, pd: ProgressionData, data: GameData): number {
  const m = relicShowcase(state, pd, data);
  return m.readyCount + (m.firstPick ? 1 : 0);
}
