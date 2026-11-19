/**
 * 판 밖 성장 데이터 (G-3): `src/data/progression.json`을 읽고 검사한다.
 *
 * - 게임 데이터(GameData, src/data/load.ts)와 **따로** 읽는다: GameData 전체가 리플레이·판 저장의 데이터 지문(dataFingerprint)에
 *   들어가므로, 메타 수치(상점 가격·퀘스트 보상 등)를 바꿀 때마다 진행 중 판 저장이 버려지지 않게.
 * - 판에 주는 영향은 영웅 레벨(→ MatchOptions.levels)과 잠긴 히든(→ MatchOptions.lockedHidden)뿐이고, 그 값은 판 입력으로 기록된다.
 * - 검사 실패는 DataError (파일 + 필드 경로). 타워 id·등급·영웅 최대 레벨(≤ game.json towerLevel.max)은 게임 데이터와 교차 검사.
 */
import progressionJson from '../data/progression.json';
import { DataError, GRADES, type GameData, type Grade } from '../data/load';
import { s, validate, type Issue, type Schema } from '../data/schema';

export const PROGRESSION_FILE = 'progression.json';

/** 영웅 카드가 나오는 일반 등급 (히든은 조각, 신은 상점 상자에서만 드물게) */
export const CARD_GRADES = ['normal', 'rare', 'unique', 'hero', 'legend'] as const;

/** 받을 것 (보상·상점 내용 공용). cards = 무작위 영웅 카드 장수, fragments = 신화 조각 개수 */
export interface RewardSpec {
  gold?: number;
  gems?: number;
  cards?: number;
  fragments?: number;
}

export type QuestStat = 'matches' | 'summons' | 'merges' | 'bossKills' | 'bestWave' | 'heroLevelSum';
export const QUEST_STATS: readonly QuestStat[] = ['matches', 'summons', 'merges', 'bossKills', 'bestWave', 'heroLevelSum'];

export interface QuestData {
  id: string;
  name: string;
  stat: QuestStat;
  target: number;
  reward: RewardSpec;
}

export interface ShopItemData {
  id: string;
  name: string;
  desc: string;
  icon: string;
  price: { gold?: number; gems?: number };
  cards?: number;
  weights?: Partial<Record<Grade, number>>;
  fragments?: number;
  gold?: number;
}

export interface ProgressionData {
  version: number;
  notes: string;
  account: { xpBase: number; xpStep: number; levelUpGems: number; every10Gems: number; startGold: number; startGems: number };
  matchRewards: {
    minStage: number;
    xpPerStage: number;
    xpPerBoss: number;
    xpNewBest: number;
    goldPerStage: number;
    goldPerBoss: number;
    fragmentsPerBoss: number;
    /** [도달 단계 이상, 카드 장수] — 단계 오름차순 */
    cardsByStage: [number, number][];
    cardGradeWeights: Partial<Record<Grade, number>>;
  };
  heroes: {
    maxLevel: number;
    /** Lv n → n+1 기본 카드 수 (index n−1) */
    cards: number[];
    /** Lv n → n+1 기본 골드 (index n−1) */
    gold: number[];
    gradeCardPct: Record<Grade, number>;
    gradeGoldPct: Record<Grade, number>;
  };
  hidden: { unlockFragments: number };
  waveRoad: { milestones: { wave: number; reward: RewardSpec }[] };
  recruit: { summonsPerPoint: number; goal: number; reward: RewardSpec; weights: Partial<Record<Grade, number>> };
  quests: { daily: QuestData[]; dailyAllBonus: RewardSpec; achievements: QuestData[] };
  shop: ShopItemData[];
  modes: { id: string; name: string; unlockLevel: number; desc: string }[];
}

const nonNeg = s.int({ min: 0 });
const reward: Schema = s.withCheck<RewardSpec>(
  s.obj({ gold: s.opt(nonNeg), gems: s.opt(nonNeg), cards: s.opt(nonNeg), fragments: s.opt(nonNeg) }),
  (v, path, issues) => {
    if (!v.gold && !v.gems && !v.cards && !v.fragments) issues.push({ path, message: '보상이 비어 있다' });
  },
);
const weights: Schema = s.withCheck<Record<string, number>>(s.rec(nonNeg), (v, path, issues) => {
  for (const k of Object.keys(v)) if (!(GRADES as readonly string[]).includes(k) || k === 'hidden') issues.push({ path: `${path}.${k}`, message: `카드가 나올 수 없는 등급: ${k}` });
  if (Object.values(v).reduce((a, b) => a + b, 0) <= 0) issues.push({ path, message: '가중치 합이 0' });
});
const gradePct: Schema = s.obj(Object.fromEntries(GRADES.map((g) => [g, s.int({ min: 1, max: 1000 })])));
const quest: Schema = s.obj({
  id: s.str({ nonEmpty: true }),
  name: s.str({ nonEmpty: true }),
  stat: s.str({ enum: QUEST_STATS }),
  target: s.int({ min: 1 }),
  reward,
});

export const progressionSchema: Schema = s.obj({
  version: s.int({ min: 1 }),
  notes: s.str(),
  account: s.obj({
    xpBase: s.int({ min: 1 }),
    xpStep: nonNeg,
    levelUpGems: nonNeg,
    every10Gems: nonNeg,
    startGold: nonNeg,
    startGems: nonNeg,
  }),
  matchRewards: s.obj({
    minStage: s.int({ min: 0 }),
    xpPerStage: nonNeg,
    xpPerBoss: nonNeg,
    xpNewBest: nonNeg,
    goldPerStage: nonNeg,
    goldPerBoss: nonNeg,
    fragmentsPerBoss: nonNeg,
    cardsByStage: s.withCheck<[number, number][]>(s.arr(s.tuple(s.int({ min: 0 }), nonNeg), { minLength: 1 }), (v, path, issues) => {
      for (let i = 1; i < v.length; i++) {
        if ((v[i] as [number, number])[0] <= (v[i - 1] as [number, number])[0]) issues.push({ path: `${path}[${i}]`, message: '단계가 오름차순이 아니다' });
        if ((v[i] as [number, number])[1] < (v[i - 1] as [number, number])[1]) issues.push({ path: `${path}[${i}]`, message: '카드 장수가 줄어든다' });
      }
    }),
    cardGradeWeights: weights,
  }),
  heroes: s.obj({
    maxLevel: s.int({ min: 2, max: 99 }),
    cards: s.arr(s.int({ min: 1 }), { minLength: 1 }),
    gold: s.arr(nonNeg, { minLength: 1 }),
    gradeCardPct: gradePct,
    gradeGoldPct: gradePct,
  }),
  hidden: s.obj({ unlockFragments: s.int({ min: 1 }) }),
  waveRoad: s.obj({
    milestones: s.withCheck<{ wave: number }[]>(s.arr(s.obj({ wave: s.int({ min: 1 }), reward }), { minLength: 1, uniqueBy: 'wave' }), (v, path, issues) => {
      for (let i = 1; i < v.length; i++) if ((v[i] as { wave: number }).wave <= (v[i - 1] as { wave: number }).wave) issues.push({ path: `${path}[${i}].wave`, message: '웨이브가 오름차순이 아니다' });
    }),
  }),
  recruit: s.obj({ summonsPerPoint: s.int({ min: 1 }), goal: s.int({ min: 1 }), reward, weights }),
  quests: s.obj({
    daily: s.arr(quest, { minLength: 1, uniqueBy: 'id' }),
    dailyAllBonus: reward,
    achievements: s.arr(quest, { minLength: 1, uniqueBy: 'id' }),
  }),
  shop: s.arr(
    s.withCheck<ShopItemData>(
      s.obj({
        id: s.str({ nonEmpty: true }),
        name: s.str({ nonEmpty: true }),
        desc: s.str({ nonEmpty: true }),
        icon: s.str({ nonEmpty: true }),
        price: s.obj({ gold: s.opt(s.int({ min: 1 })), gems: s.opt(s.int({ min: 1 })) }),
        cards: s.opt(s.int({ min: 1 })),
        weights: s.opt(weights),
        fragments: s.opt(s.int({ min: 1 })),
        gold: s.opt(s.int({ min: 1 })),
      }),
      (v, path, issues) => {
        if ((v.price.gold === undefined) === (v.price.gems === undefined)) issues.push({ path: `${path}.price`, message: '가격은 gold·gems 중 하나만' });
        if (!v.cards && !v.fragments && !v.gold) issues.push({ path, message: '내용이 비어 있다 (cards·fragments·gold)' });
        if (v.price.gold !== undefined && v.gold !== undefined) issues.push({ path, message: '골드로 골드를 살 수 없다' });
      },
    ),
    { minLength: 1, uniqueBy: 'id' },
  ),
  modes: s.arr(s.obj({ id: s.str({ nonEmpty: true }), name: s.str({ nonEmpty: true }), unlockLevel: s.int({ min: 1 }), desc: s.str({ nonEmpty: true }) }), { uniqueBy: 'id' }),
});

/** 게임 데이터와 교차 검사 (영웅 최대 레벨 ≤ sim 타워 레벨 최대, 비용 표 길이, 히든 타워가 있어야 조각이 의미 있음). */
export function crossCheckProgression(p: ProgressionData, data: Pick<GameData, 'game' | 'towers'>): Issue[] {
  const issues: Issue[] = [];
  const simMax = data.game.towerLevel.max;
  if (p.heroes.maxLevel > simMax) issues.push({ path: 'heroes.maxLevel', message: `game.json towerLevel.max(${simMax})보다 크다 — 판 레벨 입력으로 쓸 수 없다` });
  const steps = p.heroes.maxLevel - 1;
  if (p.heroes.cards.length !== steps) issues.push({ path: 'heroes.cards', message: `길이 ${p.heroes.cards.length} ≠ maxLevel − 1 (${steps})` });
  if (p.heroes.gold.length !== steps) issues.push({ path: 'heroes.gold', message: `길이 ${p.heroes.gold.length} ≠ maxLevel − 1 (${steps})` });
  const hasGrade = (g: Grade): boolean => data.towers.towers.some((t) => t.grade === g);
  const checkWeights = (w: Partial<Record<Grade, number>> | undefined, path: string): void => {
    for (const [g, v] of Object.entries(w ?? {})) if ((v ?? 0) > 0 && !hasGrade(g as Grade)) issues.push({ path: `${path}.${g}`, message: `그 등급 타워가 없다: ${g}` });
  };
  checkWeights(p.matchRewards.cardGradeWeights, 'matchRewards.cardGradeWeights');
  checkWeights(p.recruit.weights, 'recruit.weights');
  p.shop.forEach((it, i) => checkWeights(it.weights, `shop[${i}].weights`));
  // 일일·업적 id는 두 목록을 합쳐서도 겹치면 안 된다 (V2 L1 — claimQuest가 일일을 먼저 찾아 같은 id 업적은 영영 못 받고
  // claimAllQuests가 끝나지 않는다). 경로는 실제 목록·순번으로
  const ids = new Set<string>();
  const all = [...p.quests.daily.map((q, i) => ({ q, path: `quests.daily[${i}].id` })), ...p.quests.achievements.map((q, i) => ({ q, path: `quests.achievements[${i}].id` }))];
  for (const { q, path } of all) {
    if (ids.has(q.id)) issues.push({ path, message: `퀘스트 id가 겹친다 (일일·업적 합쳐서): ${q.id}` });
    ids.add(q.id);
  }
  for (const [i, q] of p.quests.daily.entries()) if (q.stat === 'heroLevelSum') issues.push({ path: `quests.daily[${i}].stat`, message: 'heroLevelSum은 업적에만 쓴다' });
  return issues;
}

/** JSON 하나 → 검사한 데이터. 실패하면 DataError. */
export function parseProgression(raw: unknown, data: Pick<GameData, 'game' | 'towers'>): ProgressionData {
  const issues: Issue[] = [];
  validate(raw, progressionSchema, '', issues);
  if (issues.length === 0) issues.push(...crossCheckProgression(raw as ProgressionData, data));
  if (issues.length > 0) throw new DataError(PROGRESSION_FILE, issues.map((i) => ({ ...i, file: PROGRESSION_FILE })));
  return raw as ProgressionData;
}

let cached: ProgressionData | null = null;

/** 번들에 든 progression.json (한 번 검사). */
export function loadProgression(data: Pick<GameData, 'game' | 'towers'>): ProgressionData {
  cached ??= parseProgression(progressionJson, data);
  return cached;
}
