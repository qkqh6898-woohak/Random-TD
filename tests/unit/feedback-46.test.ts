/**
 * 피드백 #46 — '노말 이하 자동 판매, 희귀 이하 자동 판매 체크' (이슈 본문·판 기록 없음 → 리플레이 재현 대상 없음).
 * 화면 설정(일시정지 메뉴 스위치 2개)이 방금 소환된 타워 중 기준 등급 이하인 내 타워 칸을 고르고(autoSellTiles),
 * 평소 sellTower 명령을 보낸다 → 리플레이에 그대로 남는다.
 */
import { describe, expect, it } from 'vitest';
import { towerAt, towersAt } from '../../src/sim/entities/Tower';
import { placeTower } from '../../src/sim/systems/Summon';
import { autoSellTiles } from '../../src/sim/systems/Sell';
import { autoSellGrade, parseSettings } from '../../src/meta/settings';
import { playReplay, recordReplay } from '../../src/sim/replay';
import type { Match } from '../../src/sim/match';
import { arena, arenaData, command, data, eventsOf, infinite } from '../helpers/match';

const idOf = (grade: string, i = 0): string => data.towers.towers.filter((t) => t.grade === grade)[i]!.id;

function freeTile(m: Match): readonly [number, number] {
  const t = m.map.buildable.find(([x, y]) => !towerAt(m.world, x, y));
  if (!t) throw new Error('빈 칸 없음');
  return t;
}

describe('autoSellGrade (설정 → 기준 등급)', () => {
  it('둘 다 꺼짐 = null, 노말 = normal, 레어 이하(노말과 함께 켜도) = rare', () => {
    expect(autoSellGrade(parseSettings(null))).toBeNull();
    expect(autoSellGrade({ ...parseSettings(null), autoSellNormal: true })).toBe('normal');
    expect(autoSellGrade({ ...parseSettings(null), autoSellRare: true })).toBe('rare');
    expect(autoSellGrade({ ...parseSettings(null), autoSellNormal: true, autoSellRare: true })).toBe('rare');
  });

  it('저장값: 기본 꺼짐, 예전 설정(키 없음)도 꺼짐, 불리언만 받는다', () => {
    expect(parseSettings('{"v":1,"tapMerge":false}')).toMatchObject({ autoSellNormal: false, autoSellRare: false });
    expect(parseSettings('{"autoSellNormal":true,"autoSellRare":"yes"}')).toMatchObject({ autoSellNormal: true, autoSellRare: false });
  });
});

describe('autoSellTiles', () => {
  it('기준 등급 이하인 내 타워 칸만 (id 순), 위 등급·남의 타워·없어진 id는 뺀다', () => {
    const m = infinite(1, { players: 2 });
    const pts = [freeTile(m)];
    const n = placeTower(m.world, idOf('normal'), 0, pts[0]![0], pts[0]![1]);
    pts.push(freeTile(m));
    const r = placeTower(m.world, idOf('rare'), 0, pts[1]![0], pts[1]![1]);
    pts.push(freeTile(m));
    const u = placeTower(m.world, idOf('unique'), 0, pts[2]![0], pts[2]![1]);
    pts.push(freeTile(m));
    const other = placeTower(m.world, idOf('normal', 1), 1, pts[3]![0], pts[3]![1]);
    const ids = [u.id, r.id, n.id, other.id, 9999];
    expect(autoSellTiles(m.ctx, m.world, 0, ids, 'normal')).toEqual([[n.tx, n.ty]]);
    expect(autoSellTiles(m.ctx, m.world, 0, ids, 'rare')).toEqual([
      [n.tx, n.ty],
      [r.tx, r.ty],
    ]);
    expect(autoSellTiles(m.ctx, m.world, 1, ids, 'rare')).toEqual([[other.tx, other.ty]]);
  });

  it('신·히든은 레어 이하가 아니다', () => {
    const m = arena();
    const god = data.towers.towers.find((t) => t.grade === 'god')!.id;
    const hidden = data.towers.towers.find((t) => t.grade === 'hidden')!.id;
    const a = freeTile(m);
    const g = placeTower(m.world, god, 0, a[0], a[1]);
    const b = freeTile(m);
    const h = placeTower(m.world, hidden, 0, b[0], b[1]);
    expect(autoSellTiles(m.ctx, m.world, 0, [g.id, h.id], 'rare')).toEqual([]);
  });

  it('판이 끝났으면 없음', () => {
    const m = arena();
    const a = freeTile(m);
    const t = placeTower(m.world, idOf('normal'), 0, a[0], a[1]);
    m.state.phase = 'defeat';
    expect(autoSellTiles(m.ctx, m.world, 0, [t.id], 'rare')).toEqual([]);
  });

  it('소환 → 자동 판매 명령: 노말은 팔리고 판매가를 받으며, 리플레이로 같은 결과', () => {
    // 리플레이로 다시 만들 수 있게 상태를 직접 고치지 않고 명령만 (개발자 판 돈 추가)
    const m = infinite(7, { debug: true });
    command(m, { type: 'debugAddGold', amount: 100_000 });
    for (let i = 0; i < 6; i++) command(m, { type: 'summonAuto' });
    const summoned = eventsOf(m, 'summon');
    expect(summoned.length).toBe(6);
    const goldBefore = m.state.gold;
    const tiles = autoSellTiles(m.ctx, m.world, 0, summoned.map((e) => Number(e.id)), 'normal');
    const normals = summoned.filter((e) => e.grade === 'normal').length;
    expect(normals).toBeGreaterThan(0);
    expect(tiles).toHaveLength(normals);
    for (const [x, y] of tiles) m.world.enqueue({ type: 'sellTower', x, y });
    m.step();
    expect(eventsOf(m, 'sell').map((e) => e.grade)).toEqual(new Array(normals).fill('normal'));
    expect(m.state.gold).toBe(goldBefore + normals * 15); // V2.0 PR-A 노말 판매가 15원
    // 남은 내 타워에는 노말이 없다
    for (const [x, y] of m.map.buildable) {
      for (const t of towersAt(m.world, x, y)) expect(m.rules.towers.get(t.tower)?.grade).not.toBe('normal');
    }
    const replay = recordReplay(arenaData, m, { name: 'fb46', note: '자동 판매' });
    const again = playReplay(arenaData, replay);
    expect(again.mismatch).toBeNull();
    expect(again.match.state.sells).toBe(normals);
  });
});
