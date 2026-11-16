import { describe, expect, it } from 'vitest';
import {
  DataError,
  buildGameData,
  bundledRawData,
  loadGameData,
  mapSchema,
  measurePath,
  parseData,
  parseJsonText,
  towersSchema,
  type RawGameData,
} from '../../src/data/load';
import { s, validate, type Issue } from '../../src/data/schema';
import { createMatch } from '../../src/sim/match';

/** 원본 JSON을 깊은 복사해서 일부만 망가뜨리기 위한 도우미. */
function rawCopy(): RawGameData {
  return structuredClone(bundledRawData());
}

function issuesOf(fn: () => unknown): readonly Issue[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof DataError) return e.issues;
    throw e;
  }
  throw new Error('DataError가 나지 않았다');
}

type Json = Record<string, unknown>;
const towersOf = (raw: RawGameData): Json[] => (raw.towers as Json).towers as Json[];

describe('번들 데이터 로드', () => {
  it('지금 데이터는 검사를 통과한다', () => {
    const data = loadGameData();
    expect(data.towers.towers).toHaveLength(65);
    expect(data.enemies.mobs).toHaveLength(13);
    expect(data.enemies.bosses).toHaveLength(5);
    expect(data.enemies.challenges).toHaveLength(10);
    expect(data.enemies.formations).toHaveLength(6);
    expect(data.campaign.themes).toHaveLength(10);
    expect(data.game.speeds.map((x) => x.mul)).toEqual([1, 2, 4, 8, 16]);
  });

  it('맵 파일을 자동으로 모두 읽는다 (T-3 2×2 블록: circle 32칸, crossroads 36칸)', () => {
    const { maps } = loadGameData();
    expect(Object.keys(maps).sort()).toEqual(['circle', 'crossroads']);
    expect(maps.circle?.buildableCount).toBe(32);
    expect(maps.circle?.mode).toBe('infinite');
    expect(maps.crossroads?.buildableCount).toBe(36);
    expect(maps.crossroads?.lives).toBe(20);
  });

  it('두 번 불러도 같은 객체 (캐시)', () => {
    expect(loadGameData()).toBe(loadGameData());
  });
});

describe('데이터 로더 에러 메시지 (필드 경로)', () => {
  it('필수 필드가 없으면 파일과 경로를 알려준다', () => {
    const raw = rawCopy();
    delete towersOf(raw)[3]!.aps;
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues).toContainEqual({ file: 'towers.json', path: 'towers[3].aps', message: '필수 필드가 없다' });
    expect(() => buildGameData(raw)).toThrow(/towers\.json: towers\[3\]\.aps: 필수 필드가 없다/);
  });

  it('타입이 틀리면 기대 타입과 받은 값을 알려준다', () => {
    const raw = rawCopy();
    towersOf(raw)[0]!.aps = 'fast';
    expect(() => buildGameData(raw)).toThrow(/towers\[0\]\.aps: 숫자여야 하는데 문자열 "fast"/);
  });

  it('허용 값이 아니면 목록을 보여준다', () => {
    const raw = rawCopy();
    towersOf(raw)[5]!.grade = 'epic';
    expect(() => buildGameData(raw)).toThrow(/towers\[5\]\.grade: 허용 값\(normal, rare, unique, hero, legend, god, hidden\)이 아님: "epic"/);
  });

  it('id 중복을 잡는다', () => {
    const raw = rawCopy();
    towersOf(raw)[1]!.id = towersOf(raw)[0]!.id;
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues.some((i) => i.path === 'towers[1].id' && i.message.includes('중복'))).toBe(true);
  });

  it('범위를 벗어난 값 (치명타 확률 > 1)', () => {
    const raw = rawCopy();
    towersOf(raw)[2]!.crit = 1.5;
    expect(() => buildGameData(raw)).toThrow(/towers\[2\]\.crit: 1 이하여야 하는데 1\.5/);
  });

  it('맵 의미 검사: 줄 길이, 배치 칸 수, 직각 경로', () => {
    const raw = rawCopy();
    const circle = raw.maps.circle as Json;
    const tiles = circle.tiles as string[];
    tiles[3] = tiles[3]!.slice(0, -2); // 'PBBXB' (B 하나가 빠짐)
    (circle.waypoints as number[][])[1] = [5, 3];
    const issues = issuesOf(() => buildGameData(raw));
    const paths = issues.map((i) => `${i.file}|${i.path}`);
    expect(paths).toContain('maps/circle.json|tiles[3]');
    expect(paths).toContain('maps/circle.json|buildableCount');
    expect(paths).toContain('maps/circle.json|waypoints[1]');
  });

  it('종족 색은 #RRGGBB만 (이름 색은 그리기에서 예외가 나므로 로드할 때 잡는다)', () => {
    const raw = rawCopy();
    const factions = (raw.towers as Json).factions as Record<string, Json>;
    (factions.kingdom as Json).color = 'blue';
    (factions.orc as Json).color = '#12345';
    const issues = issuesOf(() => buildGameData(raw));
    const paths = issues.map((i) => i.path);
    expect(paths).toContain('factions.kingdom.color');
    expect(paths).toContain('factions.orc.color');
    expect(issues.find((i) => i.path === 'factions.kingdom.color')?.message).toContain('#RRGGBB');
  });

  it('맵 파생값 검사: spawn = 첫 웨이포인트, exit = 마지막 점', () => {
    const raw = rawCopy();
    const cross = raw.maps.crossroads as Json;
    cross.spawn = [7, 7];
    cross.exit = [5, -1];
    const paths = issuesOf(() => buildGameData(raw)).map((i) => `${i.file}|${i.path}`);
    expect(paths).toContain('maps/crossroads.json|spawn');
    expect(paths).toContain('maps/crossroads.json|exit');
  });

  it('맵 파생값 검사: pathLength = 웨이포인트 맨해튼 길이 합, turns = 방향 전환 수', () => {
    const raw = rawCopy();
    const cross = raw.maps.crossroads as Json;
    cross.pathLength = 999;
    cross.turns = 3;
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues.find((i) => i.path === 'pathLength')?.message).toContain('59칸인데 999');
    expect(issues.find((i) => i.path === 'turns')?.message).toContain('10번인데 3');
  });

  it('맵 파생값 검사: loop 맵은 첫 점으로 돌아와야 하고, 길이 0 구간은 안 된다', () => {
    const raw = rawCopy();
    const circle = raw.maps.circle as Json;
    const wps = circle.waypoints as number[][];
    wps[wps.length - 1] = [0, 7];
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues.some((i) => i.file === 'maps/circle.json' && i.path === 'waypoints' && i.message.includes('loop'))).toBe(true);

    const raw2 = rawCopy();
    const wps2 = (raw2.maps.circle as Json).waypoints as number[][];
    wps2.splice(1, 0, [0, 2]);
    const issues2 = issuesOf(() => buildGameData(raw2));
    expect(issues2.some((i) => i.path === 'waypoints[1]' && i.message.includes('길이 0'))).toBe(true);
  });

  it('measurePath: 지금 맵 두 개의 적힌 값과 같다', () => {
    const { maps } = loadGameData();
    for (const m of Object.values(maps)) {
      expect(measurePath(m.waypoints, m.loop === true)).toEqual({ length: m.pathLength, turns: m.turns });
    }
    // 같은 방향으로 이어지는 중간 점은 방향 전환이 아니다
    expect(measurePath([[0, 0], [2, 0], [5, 0], [5, 3]], false)).toEqual({ length: 8, turns: 1 });
  });

  it('여러 파일의 문제를 한 번에 모아서 보여준다', () => {
    const raw = rawCopy();
    towersOf(raw)[0]!.name = 3;
    ((raw.enemies as Json).mobs as Json[])[2]!.speed = null;
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues).toContainEqual({ file: 'towers.json', path: 'towers[0].name', message: '문자열이어야 하는데 숫자 3' });
    expect(issues).toContainEqual({ file: 'enemies.json', path: 'mobs[2].speed', message: '숫자여야 하는데 null' });
  });

  it('교차 참조: 등장 구성에 없는 몹, 없는 종족', () => {
    const raw = rawCopy();
    (((raw.enemies as Json).composition as Json[])[0]!.mix as Json).dragonfly = 3;
    towersOf(raw)[0]!.faction = 'robots';
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues).toContainEqual({ file: 'enemies.json', path: 'composition[0].mix.dragonfly', message: '없는 몹: dragonfly' });
    expect(issues).toContainEqual({ file: 'towers.json', path: 'towers[0].faction', message: '없는 종족: robots' });
  });

  it('game.json: 배속 목록은 ×1부터 오름차순', () => {
    const raw = rawCopy();
    (raw.game as Json).speeds = [
      { mul: 2, unlockLevel: 1 },
      { mul: 1, unlockLevel: 1 },
    ];
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues.map((i) => i.path)).toEqual(['speeds[0].mul', 'speeds[1].mul']);
  });

  it('parseJsonText: JSON 문법 오류도 파일 이름과 함께', () => {
    expect(() => parseJsonText('maps/broken.json', '{ "id": ', mapSchema)).toThrow(/maps\/broken\.json.*JSON 문법 오류/);
  });

  it('parseData: 최상위가 객체가 아니면', () => {
    expect(() => parseData('towers.json', [], towersSchema)).toThrow(/\(최상위\): 객체여야 하는데 배열/);
  });
});

describe('스키마 검사기', () => {
  it('optional·nullable·tuple·record', () => {
    const schema = s.obj({
      a: s.opt(s.int()),
      b: s.nullable(s.str()),
      c: s.tuple(s.int(), s.int()),
      d: s.rec(s.int({ min: 0 }), /^\d+$/),
    });
    const ok: Issue[] = [];
    validate({ b: null, c: [1, 2], d: { '10': 5 } }, schema, '', ok);
    expect(ok).toEqual([]);
    const bad: Issue[] = [];
    validate({ a: 1.5, b: 3, c: [1], d: { x: -1 } }, schema, '', bad);
    expect(bad.map((i) => i.path)).toEqual(['a', 'b', 'c', 'd.x', 'd.x']);
  });

  it('oneOf: 어느 형식에도 맞지 않으면 이름으로 알려준다', () => {
    const schema = s.oneOf('숫자 또는 [Lv1, Lv15]', s.num(), s.tuple(s.num(), s.num()));
    const issues: Issue[] = [];
    validate('x', schema, 'params.gold', issues);
    validate([1, 2], schema, 'params.ok', issues);
    expect(issues).toEqual([{ path: 'params.gold', message: '숫자 또는 [Lv1, Lv15] 형식이어야 하는데 문자열 "x"' }]);
  });

  it('20건이 넘으면 메시지는 줄이고 issues에는 전부 남긴다', () => {
    const raw = rawCopy();
    for (const t of towersOf(raw)) delete t.atk;
    const err = (() => {
      try {
        buildGameData(raw);
      } catch (e) {
        return e as DataError;
      }
      return null;
    })();
    expect(err?.issues).toHaveLength(65);
    expect(err?.message).toContain('외 45건');
  });
});

describe('M1 데이터: 곡선 표·등장 규칙·판 설정', () => {
  const enemiesOf = (raw: RawGameData): Json => raw.enemies as Json;
  const gameOf = (raw: RawGameData): Json => raw.game as Json;

  it('curves.json도 함께 읽고 길이·단조 증가를 검사한다', () => {
    const data = loadGameData();
    expect(data.curves.maxStage).toBe(500);
    expect(data.curves.hp).toHaveLength(501);
    const raw = rawCopy();
    const curves = raw.curves as { hp: number[]; armorFlat: number[] };
    curves.hp[10] = 1;
    curves.armorFlat.pop();
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues).toContainEqual(expect.objectContaining({ file: 'curves.json', path: 'hp[10]' }));
    expect(issues).toContainEqual(expect.objectContaining({ file: 'curves.json', path: 'armorFlat' }));
  });

  it('enemies.json growth를 바꾸고 표를 다시 만들지 않으면 교차 검사가 잡는다', () => {
    const raw = rawCopy();
    ((enemiesOf(raw).growth as Json).hp as Json).base = 150;
    expect(() => buildGameData(raw)).toThrow(/curves\.json: hp\[1\]: growth\.hp\.base\(150\)와 다르다/);
    const raw2 = rawCopy();
    (enemiesOf(raw2).growth as Json).maxStage = 400;
    expect(() => buildGameData(raw2)).toThrow(/curves\.json: maxStage/);
  });

  it('growth 구간은 1단계부터 오름차순', () => {
    const raw = rawCopy();
    const segs = ((enemiesOf(raw).growth as Json).hp as Json).segments as Json[];
    segs[0]!.from = 3;
    segs[2]!.from = 21;
    const issues = issuesOf(() => buildGameData(raw));
    const paths = issues.map((i) => i.path);
    expect(paths).toContain('growth.hp.segments[0].from');
    expect(paths).toContain('growth.hp.segments[2].from');
  });

  it('등장 순서 규칙: 없는 몹·칸 수를 넘는 자리·거꾸로 된 범위', () => {
    const raw = rawCopy();
    const so = enemiesOf(raw).spawnOrder as Json;
    (so.middle as Json).mobs = ['healer', 'dragon'];
    (so.back as Json).slots = [15, 25];
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues).toContainEqual(expect.objectContaining({ path: 'spawnOrder.middle.mobs[1]', message: '없는 몹: dragon' }));
    expect(issues.find((i) => i.path === 'spawnOrder.back.slots')?.message).toContain('slotsPerStage = 20');
    const raw2 = rawCopy();
    ((enemiesOf(raw2).spawnOrder as Json).middle as Json).slots = [12, 8];
    expect(() => buildGameData(raw2)).toThrow(/spawnOrder\.middle\.slots: 시작 칸\(12\)이 끝 칸\(8\)보다 크다/);
  });

  it('구성표 칸 수 합계는 단계당 칸 수(20)와 같아야 한다', () => {
    const raw = rawCopy();
    ((enemiesOf(raw).composition as Json[])[0]!.mix as Json).slime = 19;
    expect(() => buildGameData(raw)).toThrow(/composition\[0\]\.mix: 칸 수 합계 19 ≠ 단계당 칸 수 20/);
  });

  it('투명·떼 필드 타입 (swarm은 1 이상 정수)', () => {
    const data = loadGameData();
    expect(data.enemies.mobs.filter((m) => m.invisible).map((m) => m.id)).toEqual(['thief', 'shadowwolf']);
    expect(data.enemies.mobs.find((m) => m.id === 'goblin')?.swarm).toBe(3);
    const raw = rawCopy();
    const goblin = (enemiesOf(raw).mobs as Json[]).find((m) => m.id === 'goblin')!;
    goblin.swarm = 0;
    expect(() => buildGameData(raw)).toThrow(/mobs\[\d+\]\.swarm: 1 이상이어야 하는데 0/);
  });

  it('판 설정: 등장 간격은 1틱(0.05초) 단위, 무한 맵은 있는 무한 모드 맵', () => {
    const raw = rawCopy();
    (gameOf(raw).match as Json).spawnIntervalSeconds = 2.52;
    expect(() => buildGameData(raw)).toThrow(/match\.spawnIntervalSeconds: 0\.05초\(1틱\) 단위/);
    const raw2 = rawCopy();
    (gameOf(raw2).match as Json).infiniteMapId = 'crossroads';
    expect(() => buildGameData(raw2)).toThrow(/crossroads는 무한 모드 맵이 아니다/);
    const raw3 = rawCopy();
    (gameOf(raw3).match as Json).infiniteMapId = 'nowhere';
    expect(() => buildGameData(raw3)).toThrow(/match\.infiniteMapId: 없는 맵: nowhere/);
  });

  it('맵: 경로가 지나는 칸은 P, P 칸은 경로 위 (그림과 이동이 어긋나지 않게)', () => {
    const raw = rawCopy();
    const circle = raw.maps.circle as Json;
    const tiles = circle.tiles as string[];
    tiles[2] = 'PPPXPPP'; // (3,2)는 경로인데 X
    tiles[5] = 'PXXPXXP'; // (3,5)는 P인데 경로가 아님
    const issues = issuesOf(() => buildGameData(raw));
    const msgs = issues.filter((i) => i.path === 'tiles').map((i) => i.message);
    expect(msgs).toContain('경로가 지나는데 P가 아닌 칸: [3,2]');
    expect(msgs).toContain('경로가 지나지 않는 P 칸: [3,5]');
  });

  it('맵 2×2 블록 문법 (T-3): 3×3 블록·블록 밖 배치 칸은 로드할 때 잡는다', () => {
    const raw = rawCopy();
    const circle = raw.maps.circle as Json;
    (circle.blocks as Record<string, Json>)['안1'] = { x: 1, y: 3, w: 3, h: 2 };
    const tiles = circle.tiles as string[];
    tiles[5] = 'PXXBXXP'; // 블록 밖 B
    circle.buildableCount = 33;
    const issues = issuesOf(() => buildGameData(raw));
    const msgs = issues.filter((i) => i.file === 'maps/circle.json').map((i) => `${i.path}|${i.message}`);
    expect(msgs).toContain('blocks.안1|블록은 2×2이어야 한다 (지금 3×2)');
    expect(msgs.some((m) => m.startsWith('tiles|블록 밖 배치 칸(B)') && m.includes('[3,5]'))).toBe(true);
  });
});

describe('M2 데이터: 덱·소환·전투', () => {
  const decksOf = (raw: RawGameData): Json => raw.decks as Json;
  const gameOf = (raw: RawGameData): Json => raw.game as Json;

  it('decks.json 기본 덱: 등급별 5종, 소환 비용 100원, 투사체 12칸/초', () => {
    const data = loadGameData();
    expect(data.decks.perGrade).toBe(5);
    expect(data.decks.base.normal).toEqual(['miner', 'goblin', 'archer', 'apprentice', 'warrior']);
    expect(data.game.summon.cost).toBe(100);
    expect(data.game.combat.projectileSpeed).toBe(12);
  });

  it('덱 교차 검사: 없는 타워·다른 등급·개수·중복·처음 해금이 아닌 타워를 잡는다', () => {
    const raw = rawCopy();
    const base = decksOf(raw).base as Record<string, string[]>;
    base.normal = ['miner', 'goblin', 'archer', 'apprentice', 'ghostking'];
    base.rare = ['merchant', 'mudshaman', 'flamemage', 'cleaver', 'icemage'];
    base.unique = ['icemage', 'icemage', 'blacksmith', 'sniper', 'berserker'];
    base.hero = ['summoner', 'scholar', 'chronomancer', 'alchemist'];
    base.legend = ['dragoncaller', 'warlord', 'archmage', 'assassin', 'fortuna'];
    base.legend[4] = towersOf(raw).find((t) => t.grade === 'legend' && t.unlock === 'unlock')!.id as string;
    const issues = issuesOf(() => buildGameData(raw));
    const msgs = issues.filter((i) => i.file === 'decks.json').map((i) => `${i.path}: ${i.message}`);
    expect(msgs).toContain('base.normal[4]: 없는 타워: ghostking');
    expect(msgs).toContain('base.rare[4]: icemage는 unique 등급이다 (rare 자리)');
    expect(msgs).toContain('base.unique[1]: 같은 타워가 두 번: icemage');
    expect(msgs).toContain('base.hero: hero 등급이 4종 (5종이어야 한다)');
    expect(msgs.some((m) => m.startsWith('base.legend[4]:') && m.includes('처음부터 해금된 타워가 아니다'))).toBe(true);
  });

  it('game.json summon·combat 스키마: 비용은 1 이상 정수, 확률 0~1, 투사체 속도는 0.02칸/초 단위', () => {
    const raw = rawCopy();
    (gameOf(raw).summon as Json).cost = 0;
    (gameOf(raw).summon as Json).godChance = 2;
    (gameOf(raw).combat as Json).projectileSpeed = 12.01;
    const issues = issuesOf(() => buildGameData(raw));
    const paths = issues.filter((i) => i.file === 'game.json').map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['summon.cost', 'summon.godChance', 'combat.projectileSpeed']));
    const raw2 = rawCopy();
    delete (gameOf(raw2) as Json).summon;
    expect(() => buildGameData(raw2)).toThrow(/summon/);
  });
});

describe('M4 데이터: 몹 특성·보스·편대·카드', () => {
  const enemiesOf = (raw: RawGameData): Json => raw.enemies as Json;
  const gameOf = (raw: RawGameData): Json => raw.game as Json;
  const cardsOf = (raw: RawGameData): Json[] => (raw.cards as Json).cards as Json[];

  it('cards.json도 함께 읽는다 (12장, 3장 묶음)', () => {
    const data = loadGameData();
    expect(data.cards.cards).toHaveLength(12);
    expect(data.cards.offerSize).toBe(3);
  });

  it('깨짐·보스 소환 몹은 있는 몹이어야 한다', () => {
    const raw = rawCopy();
    const mobs = enemiesOf(raw).mobs as Json[];
    (mobs.find((m) => m.id === 'gemgolem')!.splitInto as Json).id = 'pebble';
    const bosses = enemiesOf(raw).bosses as Json[];
    (bosses.find((b) => b.id === 'batqueen')!.params as Json).summonMob = 'dragon';
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues.some((i) => /mobs\[\d+\]\.splitInto\.id/.test(i.path) && i.message.includes('pebble'))).toBe(true);
    expect(issues.some((i) => /bosses\[\d+\]\.params\.summonMob/.test(i.path))).toBe(true);
  });

  it('보스 순환에 모르는 id는 잡되, 일반 단계보다 긴 90초 보스 제한은 허용', () => {
    const raw = rawCopy();
    (enemiesOf(raw).bossCycle as Json).captains = ['batqueen', 'nobody'];
    (gameOf(raw).boss as Json).timeLimitSeconds = 90;
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues.some((i) => i.path === 'bossCycle.captains[1]')).toBe(true);
    expect(issues.some((i) => i.path === 'boss.timeLimitSeconds')).toBe(false);
  });

  it('편대 예고 글자(banner·hint)는 필수', () => {
    const raw = rawCopy();
    delete ((enemiesOf(raw).formations as Json[])[0] as Json).hint;
    expect(issuesOf(() => buildGameData(raw)).some((i) => i.path === 'formations[0].hint')).toBe(true);
  });

  it('카드: 효과 종류마다 필요한 수치 (없는 값·정수 아님·소환 최소 비용)', () => {
    const raw = rawCopy();
    const cards = cardsOf(raw);
    delete (cards[1]!.effect as Json).value; // 긴급 자금
    (cards[2]!.effect as Json).value = 2.5; // 행운의 소환 횟수
    delete (cards[5]!.effect as Json).min; // 소환 할인
    (cards[0]!.effect as Json).type = 'nuke';
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues.some((i) => i.file === 'cards.json' && i.path === 'cards[0].effect.type')).toBe(true);
    const raw2 = rawCopy();
    const cards2 = cardsOf(raw2);
    delete (cards2[1]!.effect as Json).value;
    (cards2[2]!.effect as Json).value = 2.5;
    delete (cards2[5]!.effect as Json).min;
    const issues2 = issuesOf(() => buildGameData(raw2));
    expect(issues2.some((i) => i.path === 'cards[1].effect.value')).toBe(true);
    expect(issues2.some((i) => i.path === 'cards[2].effect.value' && i.message.includes('정수'))).toBe(true);
    expect(issues2.some((i) => i.path === 'cards[5].effect.min')).toBe(true);
  });

  it('보스 패턴 수치가 잘못되면 판을 만들 때 경로가 든 에러', () => {
    const raw = rawCopy();
    ((enemiesOf(raw).bosses as Json[]).find((b) => b.id === 'chaosdragon')!.params as Json).stunSeconds = 0;
    const data = buildGameData(raw);
    expect(() => createMatch(data, { seed: 1, mode: 'infinite' })).toThrow(/enemies\.json bosses\.chaosdragon\.params\.stunSeconds/);
  });
});

describe('M5 데이터: 강화·도박·도전·미션', () => {
  const missionsOf = (raw: RawGameData): Json[] => (raw.missions as Json).missions as Json[];
  const gameOf5 = (raw: RawGameData): Json => raw.game as Json;
  const challengesOf = (raw: RawGameData): Json[] => (raw.enemies as Json).challenges as Json[];

  it('missions.json도 함께 읽는다 (일반 30 + 히든 11, 일반 보상 합계 17,000원)', () => {
    const data = loadGameData();
    expect(data.missions.missions).toHaveLength(41);
    const normal = data.missions.missions.filter((m) => !m.hidden);
    expect(normal).toHaveLength(30);
    expect(normal.reduce((a, m) => a + m.reward, 0)).toBe(17000);
    expect(data.curves.transcendCost[0]).toBe(data.game.upgrade.transcend.costBase);
  });

  it('강화: 빠진 등급·겹친 등급·같은 능력치 둘·초월 비용 표가 다르면 잡는다', () => {
    const raw = rawCopy();
    const up = gameOf5(raw).upgrade as Json;
    const grade = up.grade as Json[];
    (grade[0] as Json).grades = ['normal']; // rare 빠짐
    (grade[1] as Json).grades = ['unique', 'hero', 'legend']; // legend 겹침
    ((up.stat as Json[])[1] as Json).stat = 'apsPct'; // 공속 둘
    (up.transcend as Json).costBase = 40000;
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues.some((i) => i.path === 'upgrade.grade' && i.message.includes('rare'))).toBe(true);
    expect(issues.some((i) => i.path === 'upgrade.grade[2].grades[0]' || i.path === 'upgrade.grade[1].grades[2]')).toBe(true);
    expect(issues.some((i) => i.path === 'upgrade.stat[1].stat')).toBe(true);
    expect(issues.some((i) => i.file === 'curves.json' && i.path === 'transcendCost[0]')).toBe(true);
  });

  it('도박: 확률 합 1, 없는 이동 배율, 잭팟 배율, 테이블 오름차순', () => {
    const raw = rawCopy();
    const g = gameOf5(raw).gamble as Json;
    ((g.outcomes as Json[])[0] as Json).chance = 0.5;
    g.zeroShiftTo = 7;
    (g.jackpot as Json).minMul = 50;
    ((g.tables as Json[])[1] as Json).cost = 5;
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues.some((i) => i.path === 'gamble.outcomes' && i.message.includes('확률 합'))).toBe(true);
    expect(issues.some((i) => i.path === 'gamble.zeroShiftTo')).toBe(true);
    expect(issues.some((i) => i.path === 'gamble.jackpot.minMul')).toBe(true);
    expect(issues.some((i) => i.path === 'gamble.tables[1].cost')).toBe(true);
  });

  it('도전 보스: 특수 능력 필드 타입과 면역 종류, 단계 순서', () => {
    const raw = rawCopy();
    const ch = challengesOf(raw);
    (ch[4] as Json).immune = ['fear'];
    (ch[5] as Json).teleport = { everySeconds: 0.01, tiles: 2 };
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues.some((i) => i.path === 'challenges[4].immune[0]')).toBe(true);
    expect(issues.some((i) => i.path === 'challenges[5].teleport.everySeconds')).toBe(true);
    const raw2 = rawCopy();
    (challengesOf(raw2)[2] as Json).level = 9;
    expect(issuesOf(() => buildGameData(raw2)).some((i) => i.path === 'challenges[2].level')).toBe(true);
  });

  it('미션: 조건 종류마다 필요한 값, 모르는 판 상태·강화·테이블·타워', () => {
    const raw = rawCopy();
    const ms = missionsOf(raw);
    delete ((ms[0] as Json).cond as Json).grade;
    ((ms[8] as Json).cond as Json).key = 'dances';
    ((ms[16] as Json).cond as Json).key = 'turbo';
    ((ms[18] as Json).cond as Json).table = 777;
    (((ms[36] as Json).cond as Json).towers as string[])[0] = 'nobody';
    ((ms[3] as Json).cond as Json).type = 'magic';
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues.some((i) => i.file === 'missions.json' && i.path === 'missions[3].cond.type')).toBe(true);
    const raw2 = rawCopy();
    const ms2 = missionsOf(raw2);
    delete ((ms2[0] as Json).cond as Json).grade;
    ((ms2[8] as Json).cond as Json).key = 'dances';
    ((ms2[16] as Json).cond as Json).key = 'turbo';
    ((ms2[18] as Json).cond as Json).table = 777;
    (((ms2[36] as Json).cond as Json).towers as string[])[0] = 'nobody';
    const issues2 = issuesOf(() => buildGameData(raw2));
    for (const path of ['missions[0].cond.grade', 'missions[8].cond.key', 'missions[16].cond.key', 'missions[18].cond.table', 'missions[36].cond.towers[0]']) {
      expect(issues2.some((i) => i.file === 'missions.json' && i.path === path)).toBe(true);
    }
  });
});
