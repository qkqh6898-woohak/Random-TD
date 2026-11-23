/**
 * 로비 화면 모델 (G-3, 순수 — DOM 없음): 영웅 카드 목록·정렬, 웨이브 길, 리미티드 조각, 상단 바, 정산 요약.
 * 화면(Lobby.ts·GameOverScreen.ts)은 이 모델을 그리기만 한다. 수치는 progression.json · towers.json에서.
 */
import { heroMilestones, heroTotalAtkBp, type MilestoneItem } from '../../meta/v3/milestones';
import { GRADE_NAMES, GRADE_RANK } from '../../data/grades';
import type { GameData, Grade, TowerData } from '../../data/load';
import { GRADE_COLORS } from '../../art/palette';
import type { ProgressionData } from '../../meta/progressionData';
import {
  checkLevelUp,
  checkUnlock,
  heroEntry,
  levelUpCost,
  milestoneState,
  recruitClaimable,
  recruitMultiCount,
  xpToNext,
  type Grant,
  type LevelUpCheck,
  type MatchSettlement,
  type MilestoneState,
  type ProgressState,
} from '../../meta/progress';

/** 등급 이름 — 정답은 src/data/grades.ts (V2.0 PR-A 통일, 예전 이 파일의 표는 지움) */
export const GRADE_KO: Readonly<Record<Grade, string>> = GRADE_NAMES;

/** 영웅 탭: [영웅] 노말~레전드 / [리미티드] 히든(리미티드)·신 */
export type HeroTab = 'heroes' | 'mythic';
/** 'ready' = 피드백 #31 레벨업 가능(카드가 모인 영웅) 먼저 */
export type HeroSort = 'grade' | 'level' | 'ready';

export function tabOf(grade: Grade): HeroTab {
  return grade === 'hidden' || grade === 'god' ? 'mythic' : 'heroes';
}

export function gradeColor(grade: Grade): string {
  if (grade === 'hidden') return '#F1C40F';
  if (grade === 'god') return '#FFF6D6';
  return GRADE_COLORS[grade];
}

export interface HeroCardModel {
  id: string;
  name: string;
  grade: Grade;
  gradeName: string;
  color: string;
  level: number;
  owned: boolean;
  /** 가진 카드 (히든은 조각) */
  cards: number;
  /** 다음 레벨에 필요한 카드 (최대 레벨·미보유면 null). 잠긴 히든이면 해방 조각 수 */
  need: number | null;
  /** 레벨업할 카드가 모였다 (골드는 따로) → 위쪽 화살표 */
  ready: boolean;
  /** 잠긴 히든 (조각을 모아 해방) */
  locked: boolean;
  /** 전투 덱(기본 덱)에 들어 있는가 */
  inDeck: boolean;
  max: boolean;
}

function deckIds(data: Pick<GameData, 'decks'>): Set<string> {
  const b = data.decks.base;
  return new Set([...b.normal, ...b.rare, ...b.unique, ...b.hero, ...b.legend]);
}

/**
 * 배지 규칙 한 곳 (검토 L7): '지금 바로 할 수 있는 일'만 센다.
 * - 레벨업: 보유 + checkLevelUp 'ok'(카드 + 🔥 불꽃) — 영웅 ▲ · [영웅] 탭 점 · [⬆ 모두 레벨업 N]이 같이 쓴다.
 * - 해방: 잠긴 리미티드 + checkUnlock 'ok'(조각) — [도감] 탭 점만 센다 (영웅 탭 점과 두 번 세지 않음). 카드의 ▲는 해방에도 뜬다.
 */
export function heroLevelUpReady(state: ProgressState, pd: ProgressionData, t: TowerData): boolean {
  return heroEntry(state, t.id).level >= 1 && checkLevelUp(state, pd, t) === 'ok';
}

export function heroUnlockReady(state: ProgressState, pd: ProgressionData, t: TowerData): boolean {
  return checkUnlock(state, pd, t) === 'ok';
}

export function heroCard(state: ProgressState, pd: ProgressionData, t: TowerData, deck: ReadonlySet<string>): HeroCardModel {
  const e = heroEntry(state, t.id);
  const owned = e.level >= 1;
  const locked = t.grade === 'hidden' && !owned;
  const cost = owned ? levelUpCost(pd, t.grade, e.level) : null;
  const need = locked ? pd.hidden.unlockFragments : cost ? cost.cards : null;
  return {
    id: t.id,
    name: t.name,
    grade: t.grade,
    gradeName: GRADE_KO[t.grade],
    color: gradeColor(t.grade),
    level: e.level,
    owned,
    cards: e.cards,
    need,
    // V2.0 PR-A: ▲·탭 배지·[모두 레벨업 N]이 같은 규칙 — 레벨업은 checkLevelUp(카드 + 🔥 불꽃) 'ok', 잠긴 리미티드는 조각이 모였을 때
    ready: locked ? heroUnlockReady(state, pd, t) : heroLevelUpReady(state, pd, t),
    locked,
    inDeck: deck.has(t.id),
    max: owned && cost === null,
  };
}

export interface HeroGridModel {
  owned: HeroCardModel[];
  unowned: HeroCardModel[];
  /** 지금 바로 레벨업(카드 + 🔥 불꽃)·해방할 수 있는 영웅 수 (이 목록의 ▲ 수) */
  ready: number;
  /** 지금 바로(카드 + 🔥 불꽃) 레벨업할 수 있는 보유 영웅 수 — [⬆ 모두 레벨업 N] (= 보유 영웅의 ▲ 수) */
  canLevel: number;
}

/** 영웅 탭 목록: 보유(정렬) + 보유하지 않음(등급 순). 같은 값이면 데이터 순서 */
export function heroGrid(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers' | 'decks'>, tab: HeroTab, sort: HeroSort): HeroGridModel {
  const deck = deckIds(data);
  const order = new Map(data.towers.towers.map((t, i) => [t.id, i]));
  const cards = data.towers.towers.filter((t) => tabOf(t.grade) === tab).map((t) => heroCard(state, pd, t, deck));
  const byGrade = (a: HeroCardModel, b: HeroCardModel): number => GRADE_RANK[b.grade] - GRADE_RANK[a.grade] || (order.get(a.id) as number) - (order.get(b.id) as number);
  const byLevel = (a: HeroCardModel, b: HeroCardModel): number => b.level - a.level || byGrade(a, b);
  const byReady = (a: HeroCardModel, b: HeroCardModel): number => Number(b.ready) - Number(a.ready) || byGrade(a, b);
  const owned = cards.filter((c) => c.owned).sort(sort === 'level' ? byLevel : sort === 'ready' ? byReady : byGrade);
  const unowned = cards.filter((c) => !c.owned).sort(byGrade);
  const towers = new Map(data.towers.towers.map((t) => [t.id, t]));
  const canLevel = owned.filter((c) => heroLevelUpReady(state, pd, towers.get(c.id) as TowerData)).length;
  return { owned, unowned, ready: cards.filter((c) => c.ready).length, canLevel };
}

/** [영웅] 탭 점: 영웅 + 리미티드 탭에서 지금 레벨업할 수 있는 보유 영웅 수 (해방은 [도감] 점 — codexReady) */
export function heroesReady(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers' | 'decks'>): number {
  return data.towers.towers.filter((t) => heroLevelUpReady(state, pd, t)).length;
}

/** [도감] 탭 점: 지금 해방할 수 있는 잠긴 리미티드 수 */
export function codexReady(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers'>): number {
  return data.towers.towers.filter((t) => heroUnlockReady(state, pd, t)).length;
}

export interface HeroDetailModel extends HeroCardModel {
  lore: string;
  role: string;
  ability: string;
  awaken: string;
  stats: { label: string; value: string }[];
  /** 지금 레벨의 전투 공격력 보너스 % 글자 ('+8%') · 다음 레벨 */
  bonus: string;
  nextBonus: string | null;
  cost: { cards: number; flame: number } | null;
  check: LevelUpCheck;
  /** 잠긴 히든: 해방 가능 */
  canUnlock: boolean;
  recipe: string[];
  /** V3 P1 마일스톤 5칸 (보유 영웅은 레벨로 바로 적용됨) */
  milestones: MilestoneItem[];
}

const DAMAGE_KO: Record<string, string> = { physical: '물리', magic: '마법', hybrid: '물리+마법', true: '고정' };
const SHAPE_KO: Record<string, string> = { single: '단일', melee: '근접', aoe: '범위', melee_aoe: '근접 범위', pierce: '관통', chain: '연쇄', multi: '다중', global: '전체' };

function pctText(bp: number): string {
  return `+${Math.round(bp / 100)}%`;
}

export function heroDetail(state: ProgressState, pd: ProgressionData, data: GameData, id: string): HeroDetailModel | null {
  const t = data.towers.towers.find((x) => x.id === id);
  if (!t) return null;
  const card = heroCard(state, pd, t, deckIds(data));
  const cost = card.owned ? levelUpCost(pd, t.grade, card.level) : null;
  const atk = Math.round((t.atk + t.matk + (t.tatk ?? 0)) * 100) / 100;
  const names = new Map(data.towers.towers.map((x) => [x.id, x.name]));
  return {
    ...card,
    lore: t.lore,
    role: t.role,
    ability: t.ability,
    awaken: t.awaken,
    stats: [
      { label: '공격력', value: String(atk) },
      { label: '공격 속도', value: `${t.aps}회/초` },
      { label: '사거리', value: t.range >= 50 ? '맵 전체' : `${t.range}칸` },
      { label: '공격', value: `${DAMAGE_KO[t.damageType] ?? t.damageType} · ${SHAPE_KO[t.shape] ?? t.shape}` },
    ],
    // V3 P1: 기존 (Lv−1)×4% + 마일스톤 공격력 (Lv3·Lv15)
    bonus: pctText(heroTotalAtkBp(data, t.id, Math.max(1, card.level))),
    nextBonus: cost ? pctText(heroTotalAtkBp(data, t.id, card.level + 1)) : null,
    cost,
    check: checkLevelUp(state, pd, t),
    canUnlock: checkUnlock(state, pd, t) === 'ok',
    recipe: (t.recipe ?? []).map((r) => names.get(r) ?? r),
    milestones: heroMilestones(data, t.id, card.owned ? card.level : 0),
  };
}

// ---------------------------------------------------------------------------
// 상단 바 · 웨이브 길
// ---------------------------------------------------------------------------

export interface TopBarModel {
  level: number;
  xp: number;
  xpNeed: number;
  /** 경험치 바 채움 0~1 */
  xpRatio: number;
  gold: number;
  gems: number;
  /** 🔥 불꽃 (V2.0 PR-A) */
  flame: number;
}

export function topBar(state: ProgressState, pd: ProgressionData): TopBarModel {
  const need = xpToNext(pd, state.level);
  return { level: state.level, xp: state.xp, xpNeed: need, xpRatio: Math.min(1, state.xp / need), gold: state.gold, gems: state.gems, flame: state.flame };
}

export interface WaveNode {
  wave: number;
  state: MilestoneState;
  /** 보상 글자 ('💰 300 · 🃏 3') */
  reward: string;
}

export interface WaveRoadModel {
  best: number;
  /** 아래(낮은 웨이브)에서 위로: 이정표들 */
  nodes: WaveNode[];
  /** 다음 이정표 (없으면 null) */
  next: number | null;
  /** 받을 수 있는 이정표 수 */
  ready: number;
}

export function rewardText(r: { gold?: number; gems?: number; flame?: number; cards?: number; fragments?: number }): string {
  const parts: string[] = [];
  if (r.gold) parts.push(`💰 ${r.gold.toLocaleString('ko-KR')}`);
  if (r.gems) parts.push(`💎 ${r.gems.toLocaleString('ko-KR')}`);
  if (r.flame) parts.push(`🔥 ${r.flame.toLocaleString('ko-KR')}`);
  if (r.cards) parts.push(`🃏 ${r.cards}`);
  if (r.fragments) parts.push(`🧩 ${r.fragments}`);
  return parts.join(' · ');
}

export function waveRoad(state: ProgressState, pd: ProgressionData): WaveRoadModel {
  const nodes = pd.waveRoad.milestones.map((m) => ({ wave: m.wave, state: milestoneState(state, m.wave), reward: rewardText(m.reward) }));
  const next = pd.waveRoad.milestones.find((m) => m.wave > state.bestWave)?.wave ?? null;
  return { best: state.bestWave, nodes, next, ready: nodes.filter((n) => n.state === 'ready').length };
}

// ---------------------------------------------------------------------------
// 리미티드 조각 (도감/카드 탭)
// ---------------------------------------------------------------------------

export interface FragmentRow {
  id: string;
  name: string;
  have: number;
  need: number;
  unlocked: boolean;
  canUnlock: boolean;
  recipe: string[];
}

export function fragmentRows(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers'>): FragmentRow[] {
  const names = new Map(data.towers.towers.map((x) => [x.id, x.name]));
  return data.towers.towers
    .filter((t) => t.grade === 'hidden')
    .map((t) => {
      const e = heroEntry(state, t.id);
      return {
        id: t.id,
        name: t.name,
        have: e.cards,
        need: pd.hidden.unlockFragments,
        unlocked: e.level >= 1,
        canUnlock: heroUnlockReady(state, pd, t),
        recipe: (t.recipe ?? []).map((r) => names.get(r) ?? r),
      };
    });
}

// ---------------------------------------------------------------------------
// 받은 것 요약 (정산 화면 · 받기 알림)
// ---------------------------------------------------------------------------

export interface GrantView {
  xp: number;
  gold: number;
  gems: number;
  flame: number;
  levelUps: number[];
  cards: { id: string; name: string; n: number; grade: Grade; color: string; isNew: boolean }[];
  fragments: { id: string; name: string; n: number }[];
}

export function grantView(g: Grant, data: Pick<GameData, 'towers'>): GrantView {
  const tower = new Map(data.towers.towers.map((t) => [t.id, t]));
  return {
    xp: g.xp,
    gold: g.gold,
    gems: g.gems,
    flame: g.flame,
    levelUps: [...g.levelUps],
    cards: g.cards.map((c) => {
      const t = tower.get(c.id);
      const grade = t?.grade ?? 'normal';
      return { id: c.id, name: t?.name ?? c.id, n: c.n, grade, color: gradeColor(grade), isNew: c.isNew };
    }),
    fragments: g.fragments.map((f) => ({ id: f.id, name: tower.get(f.id)?.name ?? f.id, n: f.n })),
  };
}

/** 받은 것 한 줄 (알림) */
export function grantLine(g: GrantView): string {
  const parts: string[] = [];
  if (g.gold) parts.push(`💰 ${g.gold.toLocaleString('ko-KR')}`);
  if (g.gems) parts.push(`💎 ${g.gems.toLocaleString('ko-KR')}`);
  if (g.flame) parts.push(`🔥 ${g.flame.toLocaleString('ko-KR')}`);
  const cards = g.cards.reduce((a, c) => a + c.n, 0);
  if (cards) parts.push(`🃏 ${cards}장`);
  const frags = g.fragments.reduce((a, c) => a + c.n, 0);
  if (frags) parts.push(`🧩 ${frags}개`);
  if (g.levelUps.length) parts.push(`계정 Lv ${g.levelUps[g.levelUps.length - 1]}`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// 영웅 모집 창 (피드백 #76)
// ---------------------------------------------------------------------------

/** [영웅 모집] 빨간 점 (옆 버튼·[전투] 탭 수): 받을 수 있으면 1 — 여러 번 받은 뒤에도 recruitClaimable 한 규칙 */
export function recruitReady(state: ProgressState, pd: ProgressionData): number {
  return recruitClaimable(state, pd) > 0 ? 1 : 0;
}

export interface RecruitDialogModel {
  /** 게이지 글자 '17/30' (목표를 넘어 쌓여도 목표까지만) */
  progressText: string;
  /** 게이지 채움 % (0~100) */
  pct: number;
  /** 지금 받을 수 있는 횟수 */
  claimable: number;
  /** [모집 보상 받기] (한 번) */
  singleText: string;
  singleEnabled: boolean;
  /** [10번 한 번에 받기 (가능 n)] — 받을 수 있는 횟수가 2번 이상일 때만 누를 수 있다 (1번이면 [모집 보상 받기]와 같음) */
  multiText: string;
  multiEnabled: boolean;
  /** 이번에 누르면 받을 횟수 = min(가능, multiClaim) */
  multiCount: number;
  /** 화면 읽기용 이름 = 보이는 글자 + 이번에 받을 횟수 ('10번 한 번에 받기 (가능 3) · 이번에 3번 받아요') */
  multiAria: string;
}

export function recruitDialogModel(state: ProgressState, pd: ProgressionData): RecruitDialogModel {
  const { goal, multiClaim } = pd.recruit;
  const claimable = recruitClaimable(state, pd);
  const multiCount = recruitMultiCount(state, pd);
  return {
    progressText: `${Math.min(state.recruit, goal)}/${goal}`,
    pct: Math.min(100, Math.round((state.recruit / goal) * 100)),
    claimable,
    singleText: claimable > 0 ? '모집 보상 받기' : '게이지를 채워 주세요',
    singleEnabled: claimable > 0,
    multiText: `${multiClaim}번 한 번에 받기 (가능 ${claimable})`,
    multiEnabled: multiCount >= 2,
    multiCount,
    multiAria: multiCount >= 2 ? `${multiClaim}번 한 번에 받기 (가능 ${claimable}) · 이번에 ${multiCount}번 받아요` : `${multiClaim}번 한 번에 받기 (가능 ${claimable})`,
  };
}

/** 방금 받은 모집 보상 한 줄: '모집 3번 · 영웅 카드 ×15 · 💎 +30' (1번이면 앞부분 없이) */
export function recruitResultText(count: number, g: GrantView): string {
  const parts: string[] = [];
  if (count > 1) parts.push(`모집 ${count}번`);
  const cards = g.cards.reduce((a, c) => a + c.n, 0);
  if (cards) parts.push(`영웅 카드 ×${cards}`);
  if (g.gems) parts.push(`💎 +${g.gems.toLocaleString('ko-KR')}`);
  if (g.gold) parts.push(`💰 +${g.gold.toLocaleString('ko-KR')}`);
  if (g.flame) parts.push(`🔥 +${g.flame.toLocaleString('ko-KR')}`);
  const frags = g.fragments.reduce((a, c) => a + c.n, 0);
  if (frags) parts.push(`🧩 +${frags}`);
  if (g.xp) parts.push(`⭐ +${g.xp.toLocaleString('ko-KR')}`);
  if (g.levelUps.length) parts.push(`계정 Lv ${g.levelUps[g.levelUps.length - 1]}`);
  return parts.join(' · ');
}

export interface SettlementView extends GrantView {
  stage: number;
  best: number;
  newBest: boolean;
  recruitGain: number;
  /** 정산 뒤 계정 레벨·경험치 */
  level: number;
  xpRatio: number;
}

export function settlementView(s: MatchSettlement, data: Pick<GameData, 'towers'>, state: ProgressState, pd?: ProgressionData): SettlementView {
  const need = pd ? xpToNext(pd, state.level) : 0;
  return {
    ...grantView(s.grant, data),
    stage: s.stage,
    best: s.bestWave,
    newBest: s.newBest,
    recruitGain: s.recruitGain,
    level: state.level,
    xpRatio: need > 0 ? Math.min(1, state.xp / need) : 0,
  };
}
