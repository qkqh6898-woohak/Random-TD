/**
 * M3-12 리플레이: 시드 + 명령 기록 저장·재생, 끝 해시 비교. tests/replays/*.json 3개가 같은 해시로 재생되어야 한다.
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

/** 저장하는 리플레이 3개의 정의 (판 입력 + 봇 옵션). */
const SPECS: { name: string; note: string; match: MatchOptions; bot: BotOptions }[] = [
  {
    name: 'r1-basic',
    note: '무한 모드 기본 덱, 10단계 끝까지 소환·승급만 (DEV_PLAN 3.2 r1-basic)',
    match: { seed: 1, mode: 'infinite' },
    bot: { endTick: 1200 + 10 * 1200 },
  },
  {
    name: 'r2-abilities',
    note: '무한 모드 debug: 특색 16종 + 화염 마법사를 먼저 놓고 소환·모두 승급·이동·교환 15단계 (상태 이상·오라·웅덩이·병사·운석·행운의 여신)',
    match: { seed: 7, mode: 'infinite', debug: true },
    bot: {
      endTick: 1200 + 15 * 1200,
      allMerge: true,
      moveEvery: 900,
      debugTowers: [
        // 소환사는 몹이 나오는 곳(진행도 0) 옆 → 병사가 경로를 거슬러 걸어 막 나온 몹과 만난다
        [2, 2, t('summoner')],
        [4, 2, t('icemage')],
        [6, 2, t('flamemage')],
        [2, 8, t('mudshaman')],
        [4, 8, t('archmage')],
        [6, 8, t('chronomancer')],
        [3, 4, t('blacksmith')],
        [5, 4, t('scholar')],
        [3, 6, t('warlord')],
        [5, 6, t('dragoncaller')],
        [4, 5, t('assassin')],
        [0, 0, t('fortuna')],
        [8, 0, t('alchemist')],
        [0, 10, t('merchant')],
        [0, 2, t('gambler')],
        [4, 0, t('miner')],
        [2, 0, t('berserker')],
      ],
    },
  },
  {
    name: 'r3-campaign',
    note: '캠페인 테마 1(사거리 미로), 기본 덱 타워 레벨 5, 12단계 — 소환·승급·이동, 목숨이 줄어드는 판',
    match: {
      seed: 3,
      mode: 'campaign',
      theme: 1,
      levels: [Object.fromEntries(Object.values(data.decks.base).flat().map((id) => [id, 5]))],
    },
    bot: { endTick: 1200 + 12 * 1200, moveEvery: 1500 },
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
  it('3개 이상 있다', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
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

describe('기록 → 재생', () => {
  it('짧은 판을 기록해 JSON으로 저장·읽기 → 재생하면 같은 해시, 두 번 재생해도 같다', () => {
    const m = createMatch(data, { seed: 99, mode: 'infinite', debug: true });
    runBot(m, { endTick: 3000, moveEvery: 700, debugTowers: [[4, 2, t('icemage')], [4, 8, t('summoner')]] });
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
