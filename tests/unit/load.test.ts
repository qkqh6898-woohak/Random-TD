import { describe, expect, it } from 'vitest';
import {
  DataError,
  buildGameData,
  bundledRawData,
  loadGameData,
  mapSchema,
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
