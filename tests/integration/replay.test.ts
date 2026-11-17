/**
 * M3-12 리플레이: 시드 + 명령 기록 저장·재생, 끝 해시 비교. tests/replays/*.json 모두 같은 해시로 재생되어야 한다.
 * M5 검토 반영: r5-speed(공속 강화 최대 + 오라 → 초당 공격 ≤ 15), r5-menu(도박·강화·도전 10단계·미션 받기).
 * 규칙·수치를 일부러 바꿨으면 `npm run replays`(UPDATE_REPLAYS=1)로 다시 만들고 PROGRESS에 적는다.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMatch, type MatchOptions } from '../../src/sim/match';
import { dataFingerprint, playReplay, recordReplay, replayToJson, validateReplay, type ReplayFile } from '../../src/sim/replay';
import { buildMatchRules } from '../../src/sim/rules';
import { data } from '../helpers/match';
import { runBot, type BotOptions } from '../replays/bot';

const DIR = join(__dirname, '..', 'replays');
const rules = buildMatchRules(data);
const t = (id: string): number => rules.towerOrder.indexOf(id);

/**
 * 순환의 정원 v3(G-1 큰 칸)의 경로와 맞닿은 칸 12개(고리 안 블록 4 + 위·아래 블록의 고리 쪽 줄 8) + 네 귀퉁이 4칸 = 16칸에
 * 타워를 돌려 가며 놓는다 (debug, skip 칸 제외). 나머지 4칸은 봇 소환용.
 */
const RING16: readonly [number, number][] = [
  [2, 3], [3, 3], [2, 4], [3, 4],
  [0, 1], [1, 1], [4, 1], [5, 1],
  [0, 6], [1, 6], [4, 6], [5, 6],
  [0, 0], [5, 0], [0, 7], [5, 7],
];
function innerRing(kinds: string[], skip: readonly [number, number][] = []): [number, number, number][] {
  const out: [number, number, number][] = [];
  let k = 0;
  for (const [x, y] of RING16) {
    if (skip.some(([sx, sy]) => sx === x && sy === y)) continue;
    out.push([x, y, t(kinds[k++ % kinds.length] as string)]);
  }
  return out;
}

/** 감지 타워가 없는 덱 (저격수 → 번개 마법사, 그림자 암살자 → 폭풍 군주): r3-invisible */
const NO_DETECT_DECK = {
  ...data.decks.base,
  unique: ['icemage', 'gambler', 'blacksmith', 'lightning', 'berserker'],
  legend: ['dragoncaller', 'warlord', 'archmage', 'stormlord', 'fortuna'],
};
const allLv = (deck: Record<string, string[]>, lv: number): Record<string, number> => Object.fromEntries(Object.values(deck).flat().map((id) => [id, lv]));

/** 저장하는 리플레이의 정의 (판 입력 + 봇 옵션). */
const SPECS: { name: string; note: string; match: MatchOptions; bot: BotOptions }[] = [
  {
    name: 'r1-basic',
    note: '무한 모드 기본 덱, 10단계 끝까지 소환·승급만 (DEV_PLAN 3.2 r1-basic) — G-1: 무더기 소환(summonAuto)·연쇄 승급(mergeStack)',
    match: { seed: 1, mode: 'infinite' },
    bot: { endTick: 1200 + 10 * 1200, stacks: true },
  },
  {
    name: 'r2-abilities',
    note: '무한 모드 debug: 특색 12종 + 화염 마법사를 먼저 놓고 (G-1 큰 칸 20칸 — 소환·승급 자리 7칸을 남김) 소환·모두 승급·이동·교환 15단계 (상태 이상·오라·웅덩이·병사·운석·행운의 여신)',
    match: { seed: 7, mode: 'infinite', debug: true },
    bot: {
      endTick: 1200 + 15 * 1200,
      allMerge: true,
      moveEvery: 900,
      // G-1: 순환의 정원 v3 (6×8, 큰 칸 20칸) 칸으로 옮김
      debugTowers: [
        // 몹은 (0,2)에서 나와 윗줄 길을 먼저 지난다 → 맞아야 일하는 특색(웅덩이·빙결·병사·운석·시간 정지·주사위)을 윗줄 쪽에.
        // 큰 칸 맵은 길이 짧아 몹이 고리 끝((0,5) 쪽)까지 거의 오지 않는다
        [0, 1, t('mudshaman')],
        [1, 1, t('icemage')],
        [4, 1, t('summoner')],
        [5, 1, t('flamemage')],
        [2, 3, t('archmage')],
        [3, 3, t('chronomancer')],
        [2, 4, t('blacksmith')],
        [3, 4, t('scholar')],
        [0, 0, t('gambler')],
        [4, 0, t('fortuna')],
        [5, 0, t('alchemist')],
        [1, 6, t('dragoncaller')],
        [4, 6, t('assassin')],
      ],
    },
  },
  {
    name: 'r3-campaign',
    note: '캠페인 테마 1(사거리 미로), 기본 덱 타워 레벨 5 — 소환·승급·이동, 목숨이 줄어들다 10단계 박쥐 여왕이 부른 박쥐가 새어 목숨 0 (M4부터)',
    match: {
      seed: 3,
      mode: 'campaign',
      theme: 1,
      levels: [Object.fromEntries(Object.values(data.decks.base).flat().map((id) => [id, 5]))],
    },
    bot: { endTick: 1200 + 12 * 1200, moveEvery: 1500, stacks: true },
  },
  {
    name: 'r3-invisible',
    note: '무한 모드 debug, 감지 타워가 없는 덱(Lv15) + 고리 안쪽 2×2 블록 레전드 16개, 일꾼·보스 카드 고르기 — 10·20·30 보스는 잡고 40단계 망령 군주(항상 투명)에서 제한 시간 패배 (DEV_PLAN 3.2 r3-invisible)',
    match: { seed: 3, mode: 'infinite', debug: true, decks: [NO_DETECT_DECK], levels: [allLv(NO_DETECT_DECK, 15)] },
    bot: { endTick: 1200 + 45 * 1200, pickCard: 0, workers: 0, debugTowers: innerRing(['fortuna', 'archmage', 'dragoncaller', 'stormlord', 'fortuna']) },
  },
  {
    name: 'r6-breakthrough',
    note: '무한 모드 debug, 44단계까지 건너뛴 뒤 45단계 돌파 편대(보석 골렘 깨짐·고블린 떼) ~ 49단계: 진흙 주술사 + 화염 마법사 + 정찰병(감지 오라) + 레전드 (DEV_PLAN 3.2 r6-breakthrough)',
    match: { seed: 6, mode: 'infinite', debug: true, levels: [allLv(data.decks.base, 15)] },
    bot: {
      // 틱 0~43에 44단계까지 건너뜀 → 45단계 = 틱 1243, 50단계(보스) = 틱 7243 → 그 직전까지
      endTick: 43 + 6 * 1200,
      skipStages: 44,
      pickCard: 1,
      workers: 3,
      debugTowers: [
        [0, 1, t('mudshaman')],
        [5, 1, t('mudshaman')],
        [0, 6, t('flamemage')],
        [5, 6, t('flamemage')],
        [2, 3, t('scout')],
        [3, 4, t('scout')],
        ...innerRing(['dragoncaller', 'archmage', 'warlord', 'fortuna'], [[0, 1], [5, 1], [0, 6], [5, 6], [2, 3], [3, 4]]),
      ],
    },
  },
  {
    name: 'r5-speed',
    note: '무한 모드 debug, 21단계로 건너뛴 뒤 대포병(공속 3) 옆에 음유시인·고수, 군주 오라 + 공속 강화 Lv50 (DEV_PLAN 3.2 r5-speed: 초당 공격 ≤ 15)',
    match: { seed: 5, mode: 'infinite', debug: true, levels: [{ ...allLv(data.decks.base, 15), gunner: 15, bard: 15, drummer: 15 }] },
    bot: {
      endTick: 21 + 2400,
      skipStages: 21,
      debugGold: 200_000,
      upgrades: [[3, 50]],
      debugTowers: [
        [2, 4, t('gunner')],
        [2, 3, t('bard')],
        [3, 4, t('drummer')],
        [3, 3, t('warlord')],
      ],
    },
  },
  {
    name: 'r5-menu',
    note: '무한 모드 debug, 히든·레전드 안쪽 블록 + 강화(전설·관통·공속·치명) + 100원 도박 5초마다 + 도전 1~10단계(쌍둥이·동결·투명·무적) + 미션 모두 받기 (M5 검토 반영)',
    match: { seed: 8, mode: 'infinite', debug: true, levels: [allLv(data.decks.base, 15)] },
    bot: {
      endTick: 1200 + 10 * 1200,
      debugGold: 2_000_000,
      claimMissions: true,
      challenges: true,
      upgrades: [
        [2, 50],
        [5, 30],
        [4, 30],
        [3, 40],
        [6, 30],
        [7, 30],
      ],
      gamble: { t: 1, every: 100 },
      pickCard: 0,
      debugTowers: [[1, 0, t('celestial')], [4, 7, t('celestial')], ...innerRing(['infiniteblade', 'warlord', 'goldking', 'archmage', 'fortuna'])],
    },
  },
  {
    name: 'r7-g1',
    note: 'G-1 게임 시스템: 무한 모드 debug, 무더기 소환·연쇄 승급·무더기 이동 + 행운 소환 도박 10초마다 + 필살기(찬 타워부터) + 신화 조합(재료가 모이면) + 3택 1·보스 카드 첫 장, 히어로 3종을 먼저 놓음 — 15단계',
    match: { seed: 17, mode: 'infinite', debug: true },
    bot: {
      endTick: 1200 + 15 * 1200,
      stacks: true,
      moveEvery: 1700,
      pickCard: 0,
      workers: 2,
      debugGold: 30_000,
      gacha: { k: 0, f: 0, every: 200 },
      debugTowers: [
        [2, 3, t('swordsaint')],
        [3, 4, t('chronomancer')],
        [1, 1, t('scholar')],
        // 신화 '황금 왕' 재료 (광부·상인·연금술사)
        [4, 6, t('miner')],
        [5, 6, t('merchant')],
        [5, 7, t('alchemist')],
      ],
    },
  },
];

function build(spec: (typeof SPECS)[number]): ReplayFile {
  const m = createMatch(data, spec.match);
  runBot(m, spec.bot);
  return recordReplay(data, m, { name: spec.name, note: spec.note });
}

if (process.env.UPDATE_REPLAYS) {
  for (const spec of SPECS) writeFileSync(join(DIR, `${spec.name}.json`), replayToJson(build(spec)));
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

describe('저장한 리플레이 (tests/replays)', () => {
  it('5개 이상 있다', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  for (const f of files) {
    it(`${f}: 다시 돌리면 주기 해시·끝 해시가 모두 같다`, () => {
      const file = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as ReplayFile;
      expect(validateReplay(file)).toBeNull();
      const r = playReplay(data, file);
      if (r.mismatch) {
        const why = r.dataChanged ? ' (데이터가 바뀌었다 → 일부러 바꿨으면 npm run replays)' : ' (데이터는 그대로 → 결정성 또는 규칙이 바뀌었다)';
        throw new Error(`${f}: ${r.mismatch.tick}틱 해시 ${r.mismatch.actual} ≠ 저장 ${r.mismatch.expected}${why}`);
      }
      expect(r.hash).toBe(file.finalHash);
      expect(r.match.tick).toBe(file.endTick);
      expect(r.dataChanged).toBe(false);
      expect(file.commands.length).toBeGreaterThan(10);
      expect(file.checkpoints.length).toBeGreaterThan(10);
    });
  }

  it('r2-abilities에는 특색이 실제로 일했다 (웅덩이·병사·운석·시간 정지·돈)', () => {
    const file = JSON.parse(readFileSync(join(DIR, 'r2-abilities.json'), 'utf8')) as ReplayFile;
    const seen = new Map<string, number>();
    let maxSlow = 0;
    let frozen = 0;
    const r = playReplay(data, file, {
      onStep: (m) => {
        for (const e of m.world.drainEvents()) seen.set(e.type, (seen.get(e.type) ?? 0) + 1);
        for (const mob of m.mobs()) {
          maxSlow = Math.max(maxSlow, mob.slowBp);
          if (mob.freezeUntil > m.tick) frozen++;
        }
      },
    });
    expect(r.mismatch).toBeNull();
    for (const type of ['puddle', 'soldier', 'soldierHit', 'meteor', 'timeStop', 'abilityGold', 'dice']) {
      expect(seen.get(type) ?? 0, type).toBeGreaterThan(0);
    }
    expect(maxSlow).toBe(5000);
    expect(frozen).toBeGreaterThan(0);
    expect(file.commands.some((c) => c.type === 'debugTower')).toBe(true);
    expect(file.commands.some((c) => c.type === 'move')).toBe(true);
    expect(file.commands.some((c) => c.type === 'hold')).toBe(true);
    expect(file.commands.some((c) => c.type === 'mergeAll')).toBe(true);
  });
});

describe('M4 리플레이', () => {
  it('r3-invisible: 감지 없이 10·20·30 보스는 잡고 40단계 망령 군주에서 제한 시간 패배 (패배 단계 = 40)', () => {
    const file = JSON.parse(readFileSync(join(DIR, 'r3-invisible.json'), 'utf8')) as ReplayFile;
    const kills: string[] = [];
    let warned = 0;
    const r = playReplay(data, file, {
      onStep: (m) => {
        for (const e of m.world.drainEvents()) {
          if (e.type === 'bossKill') kills.push(String(e.boss));
          if (e.type === 'invisibleWarn') warned++;
        }
      },
    });
    expect(r.mismatch).toBeNull();
    expect(r.match.state).toMatchObject({ phase: 'defeat', defeatReason: 'bossTime', stage: 40, bossId: 'wraithlord' });
    expect(kills).toEqual(['batqueen', 'kingslime', 'ancientgolem']);
    expect(warned).toBe(1);
    // 보스 카드 3장 + G-1 3택 1 강화 선택 4장 (5·15·25·35단계)
    expect(r.match.state.cardsPicked).toHaveLength(7);
    expect(r.match.state.cardsPicked.filter((id) => rules.cardById.get(id)?.pools.includes('boss') && !rules.cardById.get(id)?.pools.includes('pick'))).not.toHaveLength(0);
    // 판 위에 감지 타워가 한 번도 없었다
    expect(r.match.towers().every((tw) => rules.towers.get(tw.tower)?.detect === 'none')).toBe(true);
    const lord = r.match.mobs().find((x) => x.boss);
    expect(lord?.hp).toBe(lord?.maxHp);
  });

  it('r6-breakthrough: 45단계 돌파 편대 (보석 골렘 5·고블린 36·박쥐 3) + 보석 골렘이 깨지고 정찰병이 투명 몹을 드러낸다', () => {
    const file = JSON.parse(readFileSync(join(DIR, 'r6-breakthrough.json'), 'utf8')) as ReplayFile;
    const seen = new Map<string, number>();
    let formation = '';
    let maxMobs = 0;
    const spawned45 = new Map<string, number>();
    const r = playReplay(data, file, {
      onStep: (m) => {
        maxMobs = Math.max(maxMobs, m.mobCount());
        for (const e of m.world.drainEvents()) {
          seen.set(e.type, (seen.get(e.type) ?? 0) + 1);
          if (e.type === 'formationPreview') formation = String(e.id);
          if (e.type === 'spawn' && m.state.stage === 45) spawned45.set(String(e.mob), (spawned45.get(String(e.mob)) ?? 0) + Number(e.count));
        }
      },
    });
    expect(r.mismatch).toBeNull();
    expect(formation).toBe('breakthrough');
    for (const type of ['formationPreview', 'formationStart', 'split', 'heal', 'evade']) expect(seen.get(type) ?? 0, type).toBeGreaterThan(0);
    expect(r.match.defeated).toBe(false);
    expect(r.match.state.stage).toBe(49);
    expect(Object.fromEntries(spawned45)).toEqual({ gemgolem: 5, goblin: 36, bat: 3 });
    expect(maxMobs).toBeGreaterThan(10);
  });
});

describe('기록 → 재생', () => {
  it('짧은 판을 기록해 JSON으로 저장·읽기 → 재생하면 같은 해시, 두 번 재생해도 같다', () => {
    const m = createMatch(data, { seed: 99, mode: 'infinite', debug: true });
    runBot(m, { endTick: 3000, moveEvery: 700, debugTowers: [[2, 3, t('icemage')], [4, 7, t('summoner')]] });
    const file = recordReplay(data, m, { name: 'short', checkpointTicks: 100 });
    expect(file.finalHash).toBe(m.hash());
    const loaded = JSON.parse(replayToJson(file)) as ReplayFile;
    const a = playReplay(data, loaded);
    const b = playReplay(data, loaded);
    expect(a.mismatch).toBeNull();
    expect([a.hash, b.hash]).toEqual([m.hash(), m.hash()]);
    expect(a.match.state).toEqual(m.state);
  });

  it('명령 하나를 바꾸면 그 뒤 첫 주기 해시에서 어긋남을 찾는다', () => {
    const m = createMatch(data, { seed: 5, mode: 'infinite' });
    runBot(m, { endTick: 3000 });
    const file = recordReplay(data, m, { name: 'tamper', checkpointTicks: 100 });
    const i = file.commands.findIndex((c) => c.type === 'summon' && Number(c.tick) > 100);
    const bad: ReplayFile = { ...file, commands: file.commands.map((c, j) => (j === i ? { ...c, x: Number(c.x) === 0 ? 1 : 0 } : c)) };
    const r = playReplay(data, bad);
    expect(r.mismatch).not.toBeNull();
    const cmdTick = Number(file.commands[i]!.tick);
    expect(r.mismatch!.tick).toBeGreaterThan(cmdTick);
    expect(r.mismatch!.tick).toBeLessThanOrEqual(cmdTick + 100);
  });

  it('잘못된 파일은 재생 전에 거절 (버전·명령·순서·끝 틱)', () => {
    const m = createMatch(data, { seed: 5, mode: 'infinite' });
    runBot(m, { endTick: 400 });
    const file = recordReplay(data, m, { name: 'v' });
    expect(validateReplay(file)).toBeNull();
    expect(validateReplay({ ...file, version: 9 })).toMatch(/버전/);
    expect(validateReplay({ ...file, commands: [{ type: 'summon', x: 1, tick: 0, player: 0, seq: 0 }] })).toMatch(/commands\[0\]/);
    expect(validateReplay({ ...file, commands: [...file.commands].reverse() })).toMatch(/순서/);
    expect(validateReplay({ ...file, endTick: 0 })).toMatch(/끝 틱/);
    expect(() => playReplay(data, { ...file, version: 9 })).toThrow(/버전/);
  });

  it('데이터 지문: 같은 데이터면 같고, 수치가 바뀌면 달라진다', () => {
    expect(dataFingerprint(data)).toBe(dataFingerprint(JSON.parse(JSON.stringify(data))));
    const changed = JSON.parse(JSON.stringify(data));
    changed.game.summon.cost = 101;
    expect(dataFingerprint(changed)).not.toBe(dataFingerprint(data));
  });
});

describe('M5 리플레이 (검토 반영)', () => {
  it('r5-speed: 공속 강화 Lv50 + 오라 3종 → 대포병 초당 공격이 기본(3회)의 3배를 넘고, 어느 타워도 1초(20틱)에 15번을 넘지 않는다', () => {
    const file = JSON.parse(readFileSync(join(DIR, 'r5-speed.json'), 'utf8')) as ReplayFile;
    const hits = new Map<number, number[]>(); // 타워 id → 공격한 틱들
    const r = playReplay(data, file, {
      onStep: (m) => {
        for (const e of m.world.drainEvents()) {
          if (e.type !== 'attack') continue;
          const id = Number(e.tower);
          const list = hits.get(id) ?? [];
          list.push(m.tick);
          hits.set(id, list);
        }
      },
    });
    expect(r.mismatch).toBeNull();
    expect(r.match.state.upgrades[0]?.[3]).toBe(50); // 공속 강화 최대
    const maxPerSecond = (ticks: number[]): number => {
      let best = 0;
      let lo = 0;
      for (let hi = 0; hi < ticks.length; hi++) {
        while ((ticks[hi] as number) - (ticks[lo] as number) >= 20) lo++;
        best = Math.max(best, hi - lo + 1);
      }
      return best;
    };
    const gunner = r.match.towers().find((x) => x.tower === 'gunner')!;
    expect(maxPerSecond(hits.get(gunner.id) ?? [])).toBeGreaterThanOrEqual(10);
    for (const [, ticks] of hits) expect(maxPerSecond(ticks)).toBeLessThanOrEqual(rules.apsMaxMilli / 1000);
    expect(file.commands.filter((c) => c.type === 'upgrade')).toHaveLength(50);
  });

  it('r5-menu: 도박·강화·도전·미션 받기 명령이 섞인 판 — 도전 10단계까지(쌍둥이는 함께 죽어 처치 1번, 동결·무적), 미션 보상', () => {
    const file = JSON.parse(readFileSync(join(DIR, 'r5-menu.json'), 'utf8')) as ReplayFile;
    const seen = new Map<string, number>();
    const clears: number[] = [];
    let twinKills = 0;
    const r = playReplay(data, file, {
      onStep: (m) => {
        for (const e of m.world.drainEvents()) {
          seen.set(e.type, (seen.get(e.type) ?? 0) + 1);
          if (e.type === 'challengeClear') clears.push(Number(e.lv));
          if (e.type === 'kill' && e.challenge === 4) twinKills++;
        }
      },
    });
    expect(r.mismatch).toBeNull();
    expect(r.match.defeated).toBe(false);
    for (const type of ['gamble', 'claimAllMissions', 'startChallenge', 'upgrade']) expect(file.commands.some((c) => c.type === type), type).toBe(true);
    for (const lv of [4, 7, 9, 10]) expect(clears, `도전 ${lv}단계`).toContain(lv);
    expect(twinKills).toBe(clears.filter((lv) => lv === 4).length);
    // G-1 큰 칸 맵: 도전 6단계 그림자 늑대는 5초 순간이동 전에 잡힌다 (순간이동 규칙은 Challenge.test가 본다)
    for (const type of ['challengeFreeze', 'challengeGuard', 'challengeInvisible', 'missionClaim', 'gamble']) {
      expect(seen.get(type) ?? 0, type).toBeGreaterThan(0);
    }
    expect(r.match.state.gambles).toBeGreaterThan(50);
  });
});
