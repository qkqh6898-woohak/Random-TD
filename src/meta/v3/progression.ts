/**
 * V3 P3 진행도 보상 (docs/v3/p0-spec.md 4장 · growth-plan 8장). 순수 함수 — 날짜를 쓰지 않는다. 무작위(카드)는 계정 굴림.
 *
 * - 보급 상자: 정산이 보급 수만큼 상자를 쌓고(같은 runId 장부), 열면 상자 1개 = supplyReward(열쇠·목표 조각). P2의 정산 직접 지급을 대체한다.
 * - 탐험 도장: 유효 전투 1판 = 1칸, 28칸 회차가 넘어가도 칸·미수령 보존, 받기는 앞에서부터 순서대로 (기한 없음).
 * - 진행도 패스: 유효 전투 완료 웨이브 wavesPerCell마다 1칸. 무료/황금 50칸. 황금은 보석으로 시즌마다 선택 구매(지급ID pass:<시즌>:golden),
 *   구매 전에 지난 칸도 소급 수령. 다음 시즌은 50칸을 채운 뒤 직접 넘기고, 넘기기 전에 미수령을 모두 받는다(없애지 않음). 넘친 웨이브는 이월.
 * - 성장 선택: 보급 supplyPerChoice개마다 1회 — 영웅 꾸러미(목표 영웅 다음 레벨 비용 카드·불꽃, 만렙·미보유는 고를 수 없음) 또는 열쇠.
 * - 성장 꾸러미: 계정 레벨에 열리는 1회 상품(지급ID pkg:<id>), 첫 영웅 선택권(first-hero), 비밀 코드(code:<id>) — 모두 runId와 별개인 1회 지급 장부.
 */
import type { GameData, TowerData } from '../../data/load';
import { fnv1a32 } from '../../sim/hash';
import type { Rng } from '../../sim/Rng';
import type { Grant, ProgressState } from '../progress';
import { applyReward, heroEntry, levelUpCost } from '../progress';
import type { ProgressionData, RewardSpec } from '../progressionData';
import { passCells, passComplete, stampRewardIndex, stampView } from './explore';
import { addTargetFragments } from './relics';
import { markGranted } from './state';

export const FIRST_HERO_ID = 'first-hero';

type AccountRng = (name: string) => Rng;
type Data = Pick<GameData, 'towers'>;

const emptyGrant = (): Grant => ({ xp: 0, gold: 0, gems: 0, flame: 0, cards: [], fragments: [], levelUps: [], keys: 0 });

// ---------------------------------------------------------------------------
// 보급 상자
// ---------------------------------------------------------------------------

/** 상자 n개(기본 전부) 열기: 상자마다 열쇠·목표 조각. 받은 열쇠·조각 수 (상자가 없으면 null) */
export function openSupplyBoxes(state: ProgressState, pd: ProgressionData, n = state.v3.boxes): { boxes: number; keys: number; targetFragments: number; target: string } | null {
  const k = Math.min(Math.max(0, n), state.v3.boxes);
  if (k <= 0) return null;
  state.v3.boxes -= k;
  const keys = k * pd.v3.explore.supplyReward.keys;
  const targetFragments = k * pd.v3.explore.supplyReward.targetFragments;
  state.v3.keys += keys;
  const target = state.v3.target;
  addTargetFragments(state.v3, pd, targetFragments);
  return { boxes: k, keys, targetFragments, target };
}

// ---------------------------------------------------------------------------
// 탐험 도장
// ---------------------------------------------------------------------------

/** 받을 수 있는 도장 칸 모두 받기 (앞에서부터, 회차를 넘어서도). 없으면 null */
export function claimStamps(state: ProgressState, pd: ProgressionData, data: Data, rng: AccountRng): { cells: number[]; grant: Grant } | null {
  const st = state.v3.stamp;
  if (st.claimed >= st.filled) return null;
  const grant = emptyGrant();
  const cells: number[] = [];
  while (st.claimed < st.filled) {
    const k = st.claimed;
    st.claimed += 1;
    applyReward(state, pd, data, pd.v3.stamp.rewards[stampRewardIndex(k, pd.v3.stamp.cells)] as RewardSpec, rng(`stamp:${k}`), pd.matchRewards.cardGradeWeights, grant);
    cells.push(k + 1);
  }
  return { cells, grant };
}

export function stampReady(state: ProgressState): number {
  return Math.max(0, state.v3.stamp.filled - state.v3.stamp.claimed);
}

export { stampView };

// ---------------------------------------------------------------------------
// 진행도 패스
// ---------------------------------------------------------------------------

export function passGoldenId(season: number): string {
  return `pass:${season}:golden`;
}

export interface PassView {
  season: number;
  cells: number;
  /** 지금까지 채운 칸 (0~cells) */
  reached: number;
  /** 다음 칸까지 남은 완료 웨이브 (시즌 완료면 0) */
  toNext: number;
  freeClaimed: number;
  golden: boolean;
  goldenClaimed: number;
  /** 받을 수 있는 칸 수 (무료 + 황금) */
  ready: number;
  complete: boolean;
  price: number;
}

export function passView(state: ProgressState, pd: ProgressionData): PassView {
  const p = state.v3.pass;
  const reached = passCells(p, pd.v3);
  const complete = passComplete(p, pd.v3);
  const free = Math.max(0, reached - p.freeClaimed);
  const gold = p.golden ? Math.max(0, reached - p.goldenClaimed) : 0;
  return {
    season: p.season,
    cells: pd.v3.pass.cells,
    reached,
    toNext: complete ? 0 : pd.v3.pass.wavesPerCell - (p.waves % pd.v3.pass.wavesPerCell),
    freeClaimed: p.freeClaimed,
    golden: p.golden,
    goldenClaimed: p.goldenClaimed,
    ready: free + gold,
    complete,
    price: pd.v3.pass.goldenPriceGems,
  };
}

/** 받을 수 있는 패스 칸 모두 받기 (무료 → 황금, 각각 앞에서부터). 없으면 null */
export function claimPass(state: ProgressState, pd: ProgressionData, data: Data, rng: AccountRng): { free: number[]; golden: number[]; grant: Grant } | null {
  const p = state.v3.pass;
  const reached = passCells(p, pd.v3);
  const grant = emptyGrant();
  const free: number[] = [];
  const golden: number[] = [];
  while (p.freeClaimed < reached) {
    const i = p.freeClaimed;
    p.freeClaimed += 1;
    applyReward(state, pd, data, pd.v3.pass.free[i] as RewardSpec, rng(`pass:${p.season}:free:${i}`), pd.matchRewards.cardGradeWeights, grant);
    free.push(i + 1);
  }
  if (p.golden) {
    while (p.goldenClaimed < reached) {
      const i = p.goldenClaimed;
      p.goldenClaimed += 1;
      applyReward(state, pd, data, pd.v3.pass.golden[i] as RewardSpec, rng(`pass:${p.season}:golden:${i}`), pd.matchRewards.cardGradeWeights, grant);
      golden.push(i + 1);
    }
  }
  return free.length + golden.length === 0 ? null : { free, golden, grant };
}

export type GoldenCheck = 'ok' | 'owned' | 'gems';

export function checkGolden(state: ProgressState, pd: ProgressionData): GoldenCheck {
  if (state.v3.pass.golden || state.v3.granted.includes(passGoldenId(state.v3.pass.season))) return 'owned';
  if (state.gems < pd.v3.pass.goldenPriceGems) return 'gems';
  return 'ok';
}

/** 황금 트랙 열기 (이번 시즌 1회, 보석). 지난 칸은 claimPass로 소급 수령 */
export function buyGolden(state: ProgressState, pd: ProgressionData): GoldenCheck {
  const why = checkGolden(state, pd);
  if (why !== 'ok') return why;
  state.gems -= pd.v3.pass.goldenPriceGems;
  markGranted(state.v3, passGoldenId(state.v3.pass.season));
  state.v3.pass.golden = true;
  return 'ok';
}

/** 다음 시즌으로 (50칸을 채웠을 때만). 넘기기 전에 미수령을 모두 받고, 넘친 웨이브는 이월. 받은 것 (못 넘기면 null) */
export function nextPassSeason(state: ProgressState, pd: ProgressionData, data: Data, rng: AccountRng): { season: number; grant: Grant | null } | null {
  const p = state.v3.pass;
  if (!passComplete(p, pd.v3)) return null;
  const got = claimPass(state, pd, data, rng);
  p.history = [...p.history, p.season];
  p.waves -= pd.v3.pass.cells * pd.v3.pass.wavesPerCell;
  p.season += 1;
  p.freeClaimed = 0;
  p.golden = false;
  p.goldenClaimed = 0;
  return { season: p.season, grant: got ? got.grant : null };
}

// ---------------------------------------------------------------------------
// 성장 선택
// ---------------------------------------------------------------------------

/** 영웅 꾸러미 = 다음 레벨 비용의 cardsPct%·flamePct% (올림). 만렙·미보유면 null */
export function heroPackage(state: ProgressState, pd: ProgressionData, tower: Pick<TowerData, 'id' | 'grade'>): { cards: number; flame: number } | null {
  const e = heroEntry(state, tower.id);
  if (e.level < 1) return null;
  const cost = levelUpCost(pd, tower.grade, e.level);
  if (!cost) return null;
  return { cards: Math.ceil((cost.cards * pd.v3.growthChoice.cardsPct) / 100), flame: Math.ceil((cost.flame * pd.v3.growthChoice.flamePct) / 100) };
}

export type ChoiceCheck = 'ok' | 'none' | 'notOwned' | 'max' | 'unknown';

export function checkHeroChoice(state: ProgressState, pd: ProgressionData, data: Data, heroId: string): ChoiceCheck {
  if (state.v3.explore.choicesReady <= 0) return 'none';
  const t = data.towers.towers.find((x) => x.id === heroId);
  if (!t) return 'unknown';
  const e = heroEntry(state, heroId);
  if (e.level < 1) return 'notOwned';
  if (!heroPackage(state, pd, t)) return 'max';
  return 'ok';
}

/** 성장 선택: 영웅 꾸러미 (그 영웅 카드·조각 + 불꽃) 또는 'relic' = 열쇠. 받은 것, 못 하면 이유 */
export function takeGrowthChoice(state: ProgressState, pd: ProgressionData, data: Data, pick: { hero: string } | 'relic'): Grant | Exclude<ChoiceCheck, 'ok'> {
  if (state.v3.explore.choicesReady <= 0) return 'none';
  const grant = emptyGrant();
  if (pick === 'relic') {
    state.v3.keys += pd.v3.growthChoice.relicKeys;
    grant.keys += pd.v3.growthChoice.relicKeys;
  } else {
    const why = checkHeroChoice(state, pd, data, pick.hero);
    if (why !== 'ok') return why;
    const t = data.towers.towers.find((x) => x.id === pick.hero) as TowerData;
    const pkg = heroPackage(state, pd, t) as { cards: number; flame: number };
    const e = state.heroes[t.id] as { level: number; cards: number };
    e.cards += pkg.cards;
    state.flame += pkg.flame;
    grant.flame += pkg.flame;
    if (t.grade === 'hidden') grant.fragments.push({ id: t.id, n: pkg.cards });
    else grant.cards.push({ id: t.id, n: pkg.cards, isNew: false });
  }
  state.v3.explore.choicesReady -= 1;
  state.v3.explore.choicesTaken += 1;
  return grant;
}

// ---------------------------------------------------------------------------
// 성장 꾸러미 · 첫 영웅 선택권 · 비밀 코드 (1회 지급 장부)
// ---------------------------------------------------------------------------

export function packageId(id: string): string {
  return `pkg:${id}`;
}

export type PackageCheck = 'ok' | 'unknown' | 'locked' | 'bought' | 'gold' | 'gems';

export function checkPackage(state: ProgressState, pd: ProgressionData, id: string): PackageCheck {
  const pkg = pd.v3.packages.find((x) => x.id === id);
  if (!pkg) return 'unknown';
  if (state.v3.granted.includes(packageId(id))) return 'bought';
  if (state.level < pkg.unlockLevel) return 'locked';
  if (pkg.price.gold !== undefined && state.gold < pkg.price.gold) return 'gold';
  if (pkg.price.gems !== undefined && state.gems < pkg.price.gems) return 'gems';
  return 'ok';
}

/** 꾸러미 사기 (한 번). 기존 계정도 레벨이 이미 넘었으면 바로 열려 있다 */
export function buyPackage(state: ProgressState, pd: ProgressionData, data: Data, id: string, rng: AccountRng): Grant | Exclude<PackageCheck, 'ok'> {
  const why = checkPackage(state, pd, id);
  if (why !== 'ok') return why;
  const pkg = pd.v3.packages.find((x) => x.id === id) as ProgressionData['v3']['packages'][number];
  if (pkg.price.gold !== undefined) state.gold -= pkg.price.gold;
  if (pkg.price.gems !== undefined) state.gems -= pkg.price.gems;
  markGranted(state.v3, packageId(id));
  return applyReward(state, pd, data, pkg.reward, rng(packageId(id)));
}

export function firstHeroAvailable(state: ProgressState): boolean {
  return !state.v3.granted.includes(FIRST_HERO_ID);
}

/** 첫 영웅 선택권 후보 (firstHero.grade 등급, 데이터 순서) */
export function firstHeroCandidates(pd: ProgressionData, data: Data): TowerData[] {
  return data.towers.towers.filter((t) => t.grade === pd.v3.firstHero.grade);
}

/** 첫 영웅 고르기 (한 번): 미보유 = 영입 Lv1 + newCards장, 보유 = ownedCards장 (사라지지 않음) */
export function pickFirstHero(state: ProgressState, pd: ProgressionData, data: Data, id: string): { id: string; isNew: boolean; cards: number } | null {
  if (!firstHeroAvailable(state)) return null;
  const t = firstHeroCandidates(pd, data).find((x) => x.id === id);
  if (!t) return null;
  markGranted(state.v3, FIRST_HERO_ID);
  const e = (state.heroes[id] ??= { level: 0, cards: 0 });
  if (e.level < 1) {
    e.level = 1;
    e.cards += pd.v3.firstHero.newCards;
    return { id, isNew: true, cards: pd.v3.firstHero.newCards };
  }
  e.cards += pd.v3.firstHero.ownedCards;
  return { id, isNew: false, cards: pd.v3.firstHero.ownedCards };
}

/** 코드 글자 → 해시 (대문자, 공백·하이픈 제거) */
export function codeHash(text: string): number {
  return fnv1a32(text.toUpperCase().replace(/[\s-]+/g, '')) >>> 0;
}

/** 비밀 코드 (오프라인, 코드 id당 계정 1회 — runId와 별개인 지급ID code:<id>) */
export function redeemCode(state: ProgressState, pd: ProgressionData, data: Data, text: string, rng: AccountRng): Grant | 'invalid' | 'used' {
  const h = codeHash(text);
  const code = pd.v3.secretCodes.find((c) => c.hash === h);
  if (!code) return 'invalid';
  if (!markGranted(state.v3, `code:${code.id}`)) return 'used';
  return applyReward(state, pd, data, code.reward, rng(`code:${code.id}`));
}

/** 탐험 빨간 점: 실제로 받을 수 있는 것만 (상자·도장·패스·성장 선택·첫 영웅 선택권) */
export function exploreReady(state: ProgressState, pd: ProgressionData): number {
  return state.v3.boxes + stampReady(state) + passView(state, pd).ready + state.v3.explore.choicesReady + (firstHeroAvailable(state) ? 1 : 0);
}
