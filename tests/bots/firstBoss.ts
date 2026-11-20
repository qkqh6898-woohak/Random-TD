/**
 * F10-2 첫 보스 밸런스 봇 (헤드리스, sim만, 시드 고정).
 *
 * 일반 시작(무한 모드·기본 덱·계정 Lv1·타워 Lv1·개발자 치트 없음, 지금 순환의 정원 2×2 맵)으로 10단계 박쥐 여왕까지 진행해
 * 보스를 잡았는지(처치 시각) / 시간 초과면 남은 보스 체력 %를 잰다. 사람의 손 속도를 흉내 내 0.2초(4틱)마다 행동 하나.
 *
 * 운영 두 가지 (같은 시드·같은 규칙에서 비교):
 * - A '소환·승급 중심': ① 승급할 수 있는 묶음이 있으면 승급 (결과가 생길 칸 = 그 묶음에서 경로가 가장 많이 보이는 타워 — 눌러서 바로 승급)
 *   ② 일꾼 규칙 ③ 돈이 되면 자동 소환 칸(`autoSummonTile`, 게임의 꾹 눌러 소환과 같은 칸)에 소환.
 * - B 'A + 일반 강화·미션': ① 승급 ② 받을 미션이 있으면 [모두 받기] ③ 일반 강화 규칙 ④ 일꾼 규칙 ⑤ 소환 ⑥ 칸이 다 차면 남는 돈으로 일반 강화.
 *
 * G-1 (칸 무더기·연쇄 승급·3택 1): 기본은 지금 게임과 같은 명령 — 소환 = summonAuto(같은 타워 무더기 먼저, 없으면 자동 빈 칸),
 * 승급 = 가득 찬 무더기에 mergeStack(연쇄), 3택 1 강화 선택이 오면 PICK_PREFERENCE 순으로 고른다(없으면 첫 장).
 * legacy 옵션이면 예전 명령(summon·merge — 한 칸 하나)으로 (맵만 바꾼 효과 비교용).
 *
 * 고정 규칙 (출력 표에도 적는다):
 * - 일꾼: 단계 s(준비 = 0)에서 일꾼이 min(s + 1, WORKER_MAX) 명보다 적고 돈이 되면 고용 → 준비 1명, 1단계 2명, 2단계부터 3명.
 * - 일반 강화 (B): 일반 강화 레벨 < ⌊소환 횟수 ÷ UPGRADE_PER_SUMMONS⌋ 이고 돈이 되면 강화 (소환 3번에 강화 1번 꼴).
 */
import type { GameData } from '../../src/data/load';
import { createMatch, type Match } from '../../src/sim/match';
import type { CommandInput } from '../../src/sim/Commands';
import { isMob } from '../../src/sim/entities/Mob';
import { isTower, type Tower } from '../../src/sim/entities/Tower';
import { tileAt } from '../../src/sim/map';
import { hireCheck } from '../../src/sim/systems/Economy';
import { fullStacks, mergeableGroups, sameKindTowers } from '../../src/sim/systems/Merge';
import { summonStackCheck } from '../../src/sim/systems/Board';
import { currentOffer } from '../../src/sim/systems/Cards';
import { missionsClaimable } from '../../src/sim/systems/Mission';
import { autoSummonTile, summonCheck } from '../../src/sim/systems/Summon';
import { upgradeCheck, upgradeLevel } from '../../src/sim/systems/Upgrade';

export type Strategy = 'A' | 'B';

export const STRATEGY_NAMES: Record<Strategy, string> = {
  A: '소환·승급 중심',
  B: 'A + 일반 강화·미션',
};

/** 행동 간격 (틱) — 0.2초 */
export const ACT_EVERY = 4;
/** 일꾼 최대 (봇 규칙) */
export const WORKER_MAX = 3;
/** B: 소환 몇 번마다 일반 강화 1번 */
export const UPGRADE_PER_SUMMONS = 3;
/** 일반 강화 = game.json upgrade 0번 (노말·레어 공격력) */
export const NORMAL_UPGRADE = 0;
/** 3택 1 강화 선택 (G-1): 봇이 고르는 카드 순서 (공격력 → 공속 → 소환 할인 → 행운 소환 …, 없으면 첫 장) */
export const PICK_PREFERENCE: readonly string[] = ['pickAtk', 'pickAps', 'luckySummon', 'pickDiscount', 'twinSummon', 'mergeBless', 'workerPassion', 'freeWorkers', 'pickPity', 'pickUlt'];

export interface FirstBossResult {
  seed: number;
  strategy: Strategy;
  cleared: boolean;
  /** 보스 처치 시각 (보스 등장부터 초, 소수 한 자리). 못 잡으면 null */
  killSeconds: number | null;
  /** 시간 초과(또는 다른 패배) 때 남은 보스 체력 % (소수 한 자리). 잡으면 0 */
  bossHpLeftPct: number;
  /** 보스 등장 체력 */
  bossHp: number;
  /** 패배 이유 ('' = 처치) */
  defeat: string;
  towers: number;
  summons: number;
  merges: number;
  workers: number;
  normalUpgrade: number;
  missionsClaimed: number;
  /** 보스 등장 순간의 타워 등급별 수 (normal/rare/unique/hero/legend …) */
  grades: Record<string, number>;
  /** 첫 승급 시각 (판 시작부터 초) */
  firstMergeSeconds: number | null;
}

/** 그 칸 둘레(반경 r) 경로 칸 수 — autoSummonTile과 같은 점수. */
function pathScore(m: Match, x: number, y: number): number {
  const r = m.rules.autoSummonRadius;
  let n = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if ((dx || dy) && tileAt(m.map, x + dx, y + dy) === 'path') n++;
  return n;
}

/** 승급 결과를 놓을 타워: 그 종류 중 경로 점수가 가장 높은 타워 (같으면 먼저 소환된 것). */
function bestAnchor(m: Match, group: readonly Tower[]): Tower {
  let best = group[0] as Tower;
  let bestScore = pathScore(m, best.tx, best.ty);
  for (const t of group) {
    const s = pathScore(m, t.tx, t.ty);
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }
  return best;
}

function bossHpNow(m: Match): number {
  let hp = 0;
  for (const e of m.world.entities.list()) if (isMob(e) && e.boss && !e.challenge) hp += e.hp > 0 ? e.hp : 0;
  return hp;
}

/** 봇 손잡이 (기본 = 위의 고정 규칙). 실험·진단용. */
export interface FirstBossOptions {
  workerMax?: number;
  upgradePerSummons?: number;
  /** 일꾼이 필요한데 돈이 모자라면 소환하지 않고 모은다 (기본 true) */
  saveWorkers?: boolean;
  /** 강화가 필요한데 돈이 모자라면 소환하지 않고 모은다 (기본 false) */
  saveUpgrade?: boolean;
  /** 틱마다 (step 뒤) 불린다 — 진단용 */
  onTick?: (m: Match) => void;
  /** 예전 명령(summon·merge, 한 칸 하나) — G-1 전 규칙으로 비교 */
  legacy?: boolean;
}

/** 0.2초마다 고르는 행동 하나 (없으면 null). */
function decide(m: Match, strategy: Strategy, summons: number, opts: FirstBossOptions): CommandInput | null {
  const workerMax = opts.workerMax ?? WORKER_MAX;
  const perSummons = opts.upgradePerSummons ?? UPGRADE_PER_SUMMONS;
  const ctx = m.ctx;
  const w = m.world;
  if (!opts.legacy) {
    const offer = currentOffer(ctx, 0);
    if (offer) {
      const i = PICK_PREFERENCE.map((id) => offer.cards.indexOf(id)).find((x) => x >= 0) ?? 0;
      return { type: 'pickCard', i };
    }
    const full = fullStacks(ctx, w, 0)[0];
    if (full) return { type: 'mergeStack', x: full[0]!.tx, y: full[0]!.ty };
  }
  const groups = opts.legacy ? mergeableGroups(ctx, w, 0) : [];
  if (groups.length > 0) {
    const g = groups[0]!;
    const a = bestAnchor(m, sameKindTowers(w, g.tower, 0));
    return { type: 'merge', x: a.tx, y: a.ty };
  }
  if (strategy === 'B') {
    if (missionsClaimable(m.state) > 0) return { type: 'claimAllMissions' };
    if (upgradeLevel(m.state, 0, NORMAL_UPGRADE) < Math.floor(summons / perSummons)) {
      const fail = upgradeCheck(ctx, 0, NORMAL_UPGRADE);
      if (fail === null) return { type: 'upgrade', k: NORMAL_UPGRADE };
      if (fail === 'gold' && opts.saveUpgrade === true) return null; // 강화할 돈을 모은다 (실험용, 기본은 안 모음)
    }
  }
  if (m.state.workers < Math.min(m.state.stage + 1, workerMax)) {
    const fail = hireCheck(ctx);
    if (fail === null) return { type: 'hireWorker' };
    if (fail === 'gold' && opts.saveWorkers !== false) return null; // 일꾼 살 돈을 모은다
  }
  const tile = autoSummonTile(ctx, w);
  if (!opts.legacy) {
    if (summonStackCheck(ctx, w, 0) === null) return { type: 'summonAuto' };
  } else if (tile && summonCheck(ctx, w, tile[0], tile[1]) === null) return { type: 'summon', x: tile[0], y: tile[1] };
  if (strategy === 'B' && !tile && upgradeCheck(ctx, 0, NORMAL_UPGRADE) === null) return { type: 'upgrade', k: NORMAL_UPGRADE };
  return null;
}

/** 한 판: 10단계 보스를 잡거나 패배할 때까지. */
export function runFirstBoss(d: GameData, seed: number, strategy: Strategy, opts: FirstBossOptions = {}, bossStage = 10): FirstBossResult {
  const m = createMatch(d, { seed, mode: 'infinite', legacyCommands: true });
  const w = m.world;
  let summons = 0;
  let merges = 0;
  let claimed = 0;
  let bossTick = -1;
  let killTick = -1;
  let firstMerge = -1;
  let bossHp = 0;
  let grades: Record<string, number> = {};
  const limit = m.rules.prepTicks + (bossStage - 1) * m.rules.stageTicks + Math.max(m.rules.stageTicks, m.rules.bossTimeTicks) + Math.floor((bossStage - 1) / m.rules.bossEvery) * Math.max(0, m.rules.bossTimeTicks - m.rules.stageTicks) + 40;
  while (!m.defeated && w.tick < limit) {
    if (w.tick % ACT_EVERY === 0) {
      const cmd = decide(m, strategy, summons, opts);
      if (cmd) {
        w.enqueue(cmd);
        if (cmd.type === 'summon' || cmd.type === 'summonAuto') summons++;
        if (cmd.type === 'merge' || cmd.type === 'mergeStack') {
          merges++;
          if (firstMerge < 0) firstMerge = w.tick;
        }
        if (cmd.type === 'claimAllMissions') claimed += missionsClaimable(m.state);
      }
    }
    m.step();
    opts.onTick?.(m);
    if (bossTick < 0 && m.state.stage === bossStage && m.state.bossId !== '') {
      bossTick = w.tick;
      bossHp = m.state.bossMaxHp;
      grades = {};
      for (const e of w.entities.list()) {
        if (!isTower(e)) continue;
        const g = m.rules.towers.get(e.tower)?.grade ?? '?';
        grades[g] = (grades[g] ?? 0) + 1;
      }
    }
    if (bossTick >= 0 && killTick < 0 && m.state.bossesKilled > 0) {
      killTick = w.tick;
      break;
    }
  }
  const cleared = killTick >= 0;
  const left = cleared || bossHp === 0 ? 0 : Math.round((bossHpNow(m) * 1000) / bossHp) / 10;
  return {
    seed,
    strategy,
    cleared,
    killSeconds: cleared ? Math.round((killTick - bossTick) / 2) / 10 : null,
    bossHpLeftPct: left,
    bossHp,
    defeat: cleared ? '' : m.state.defeatReason || 'none',
    towers: m.towers().length,
    summons,
    merges: m.state.merges,
    workers: m.state.workers,
    normalUpgrade: upgradeLevel(m.state, 0, NORMAL_UPGRADE),
    missionsClaimed: claimed,
    grades,
    firstMergeSeconds: firstMerge >= 0 ? Math.round(firstMerge / 2) / 10 : null,
  };
}

/** 첫 보스 봇 표 (markdown). */
export function firstBossTable(
  title: string,
  d: GameData,
  seeds: readonly number[],
  note = '',
  opts: FirstBossOptions = {},
): { md: string; clears: Record<Strategy, number>; results: Record<Strategy, FirstBossResult[]> } {
  const res: Record<Strategy, FirstBossResult[]> = { A: [], B: [] };
  for (const s of seeds) for (const st of ['A', 'B'] as Strategy[]) res[st].push(runFirstBoss(d, s, st, opts));
  const clears = { A: res.A.filter((r) => r.cleared).length, B: res.B.filter((r) => r.cleared).length };
  const cell = (r: FirstBossResult): string =>
    r.cleared ? `✅ ${r.killSeconds}초` : `❌ ${r.defeat === 'bossTime' ? '시간 초과' : r.defeat} · 남은 ${r.bossHpLeftPct}%`;
  const gradeStr = (r: FirstBossResult): string =>
    ['normal', 'rare', 'unique', 'hero', 'legend'].map((g) => r.grades[g] ?? 0).join('/');
  const avg = (xs: number[]): string => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-');
  const rows = seeds.map((s, i) => {
    const a = res.A[i]!;
    const b = res.B[i]!;
    return `| ${s} | ${cell(a)} | ${a.summons}/${a.merges} · ${gradeStr(a)} | ${cell(b)} | ${b.summons}/${b.merges} · Lv${b.normalUpgrade} · 미션 ${b.missionsClaimed} · ${gradeStr(b)} |`;
  });
  const summary = (st: Strategy): string => {
    const rs = res[st];
    const kills = rs.filter((r) => r.cleared).map((r) => r.killSeconds as number);
    const lefts = rs.filter((r) => !r.cleared).map((r) => r.bossHpLeftPct);
    return `**${clears[st]}/${seeds.length}** · 처치 평균 ${avg(kills)}초 · 시간 초과 남은 체력 평균 ${avg(lefts)}% (${lefts.length ? `${Math.min(...lefts)}~${Math.max(...lefts)}%` : '-'})`;
  };
  const bossHp = res.A[0]?.bossHp ?? 0;
  const md = [
    `## ${title}`,
    '',
    ...(note ? [note, ''] : []),
    `- 판: 무한 모드 일반 시작 · 기본 덱 · 계정 Lv1 · 타워 Lv1 · 개발자 치트 없음 · 순환의 정원(${d.maps.circle!.width}×${d.maps.circle!.height}, 배치 ${d.maps.circle!.buildableCount}칸, ${d.maps.circle!.layout === 'field' ? '가운데 마당 + 둘레 길' : '2×2 블록'}) · 인원 한도 ${d.game.board.unitCap} · 한 칸 ${d.game.board.stackMax}개`,
    `- 시작 골드 ${d.game.match.startGold}원 · 준비 ${d.game.match.prepSeconds}초 · 단계 ${d.game.match.stageSeconds}초 · 보스 제한 ${d.game.boss.timeLimitSeconds}초 · 10단계 박쥐 여왕 체력 **${bossHp.toLocaleString('en-US')}**`,
    `- 0.2초마다 행동 하나 (G-1 명령). 승급: 가득 찬 칸이 생기면 바로 mergeStack (연쇄 포함). 소환: summonAuto (같은 캐릭터 덜 찬 칸 → 자동 빈 칸). 3택 1 강화 선택은 정해 둔 선호 순서로 바로 고름. 필살기·소환 도박은 쓰지 않음.`,
    `- 일꾼: 단계 s(준비 0)에서 min(s+1, ${WORKER_MAX})명까지 돈이 되면 고용 (준비 1 · 1단계 2 · 2단계부터 ${WORKER_MAX}).`,
    `- B만: 받을 미션은 바로 [모두 받기] · 일반 강화 레벨 < ⌊소환 ÷ ${UPGRADE_PER_SUMMONS}⌋이면 강화 · 칸이 다 차면 남는 돈도 일반 강화.`,
    `- 칸: 소환/승급 횟수 · 보스 등장 때 타워 수 노말/레어/유니크/히어로/레전드.`,
    '',
    `| 시드 | A ${STRATEGY_NAMES.A} | A 소환/승급 · 등급 | B ${STRATEGY_NAMES.B} | B 소환/승급 · 강화 · 미션 · 등급 |`,
    '|---|---|---|---|---|',
    ...rows,
    '',
    `- A ${STRATEGY_NAMES.A}: ${summary('A')}`,
    `- B ${STRATEGY_NAMES.B}: ${summary('B')}`,
    '',
  ].join('\n');
  return { md, clears, results: res };
}
