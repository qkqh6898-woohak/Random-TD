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
    expect(data.game.speeds.map((x) => x.mul)).toEqual([1, 2, 3]);
  });

  it('맵 파일을 자동으로 모두 읽는다 (circle 71칸, crossroads 96칸)', () => {
    const { maps } = loadGameData();
    expect(Object.keys(maps).sort()).toEqual(['circle', 'crossroads']);
    expect(maps.circle?.buildableCount).toBe(71);
    expect(maps.circle?.mode).toBe('infinite');
    expect(maps.crossroads?.buildableCount).toBe(96);
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
    tiles[3] = tiles[3]!.slice(0, -1);
    (circle.waypoints as number[][])[1] = [6, 2];
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
    expect(issues.find((i) => i.path === 'pathLength')?.message).toContain('78칸인데 999');
    expect(issues.find((i) => i.path === 'turns')?.message).toContain('10번인데 3');
  });

  it('맵 파생값 검사: loop 맵은 첫 점으로 돌아와야 하고, 길이 0 구간은 안 된다', () => {
    const raw = rawCopy();
    const circle = raw.maps.circle as Json;
    const wps = circle.waypoints as number[][];
    wps[wps.length - 1] = [1, 8];
    const issues = issuesOf(() => buildGameData(raw));
    expect(issues.some((i) => i.file === 'maps/circle.json' && i.path === 'waypoints' && i.message.includes('loop'))).toBe(true);

    const raw2 = rawCopy();
    const wps2 = (raw2.maps.circle as Json).waypoints as number[][];
    wps2.splice(1, 0, [1, 1]);
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
    tiles[1] = 'BPPPBPPPB'; // (4,1)은 경로인데 B → 배치 칸 수도 바뀜
    tiles[5] = 'BPBBPBBPB'; // (4,5)는 P인데 경로가 아님
    const issues = issuesOf(() => buildGameData(raw));
    const msgs = issues.filter((i) => i.path === 'tiles').map((i) => i.message);
    expect(msgs).toContain('경로가 지나는데 P가 아닌 칸: [4,1]');
    expect(msgs).toContain('경로가 지나지 않는 P 칸: [4,5]');
  });
});
