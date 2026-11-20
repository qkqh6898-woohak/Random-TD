/**
 * V2 검토 H1: '승급의 축복' [바꾸기](pickMerge 1)가 무더기 안의 타워 하나만 바꿔 한 칸에 다른 타워가 섞이던 것.
 *
 * 결정 (docs/v2/fixes-notes.md):
 * - 결과 타워가 혼자인 칸이면 예전처럼 그 자리에서 바꾼다 (예전 리플레이 그대로).
 * - 무더기(2개 이상) 안이면 바뀐 타워를 ① alt 타워의 덜 찬 내 무더기 → ② 빈 배치 칸(자동 소환 칸)으로 옮긴다.
 * - 둘 다 없으면 바꾸지 않는다: 'mergePickFail' { reason: 'full' }, 선택은 사라지고 축복 1회는 돌려준다 (mergeChoices + 1).
 * - 뒷받침: 무더기 검사(stackMergeCheck·fullStacks·joinableStack)는 칸의 타워가 모두 같은 타워일 때만 무더기로 본다.
 */
import { describe, expect, it } from 'vitest';
import { listTowers, towersAt, type Tower } from '../../src/sim/entities/Tower';
import type { Match } from '../../src/sim/match';
import { placeTower } from '../../src/sim/systems/Summon';
import { joinableStack } from '../../src/sim/systems/Board';
import { fullStacks, stackMergeCheck } from '../../src/sim/systems/Merge';
import { arena, command, eventsOf } from '../helpers/match';

/** 칸마다 같은 타워만, board.stackMax 이하 (무더기 규칙). */
function expectStackRule(m: Match): void {
  const by = new Map<string, Tower[]>();
  for (const t of listTowers(m.world)) by.set(`${t.tx},${t.ty}`, [...(by.get(`${t.tx},${t.ty}`) ?? []), t]);
  for (const list of by.values()) {
    expect(list.length).toBeLessThanOrEqual(m.rules.stackMax);
    expect(new Set(list.map((t) => t.tower)).size).toBe(1);
  }
}

/**
 * 축복 1회 + 노말 3개 무더기 + 덱의 레어 5종을 한 개씩 → 무더기 승급. 결과(레어)는 같은 레어 칸에 합류해 [X, X]가 된다.
 */
function blessedMergeIntoStack(seed = 1): { m: Match; res: Tower; alt: string } {
  const m = arena(seed, { debug: true });
  m.state.perks[0]!.mergeChoices = 1;
  const pads = m.map.buildable;
  const deck = m.rules.baseDeck;
  const [ax, ay] = pads[0]!;
  for (let i = 0; i < 3; i++) placeTower(m.world, deck.normal[0]!, 0, ax, ay);
  deck.rare.forEach((r, i) => placeTower(m.world, r, 0, pads[1 + i]![0], pads[1 + i]![1]));
  command(m, { type: 'mergeStack', x: ax, y: ay });
  const pick = m.state.mergePicks[0];
  if (!pick) throw new Error('축복 선택이 생기지 않음 (신 결과?) — 다른 시드');
  const res = m.world.entities.get(pick.id) as Tower;
  return { m, res, alt: pick.alt };
}

describe('H1 승급의 축복 [바꾸기]와 칸 무더기', () => {
  it('재현 조건: 결과가 같은 레어 무더기에 합류한다 (무더기 안의 타워를 바꾸는 상황)', () => {
    const { m, res } = blessedMergeIntoStack();
    expect(towersAt(m.world, res.tx, res.ty).length).toBe(2);
    expectStackRule(m);
  });

  it('무더기 안 + alt 무더기가 있으면: 바뀐 타워는 alt의 덜 찬 무더기로 옮겨 간다', () => {
    const { m, res, alt } = blessedMergeIntoStack();
    const from = [res.tx, res.ty] as const;
    const altTower = listTowers(m.world).find((t) => t.tower === alt && t.id !== res.id)!;
    command(m, { type: 'pickMerge', id: res.id, pick: 1 });
    const moved = m.world.entities.get(res.id) as Tower;
    expect(moved.tower).toBe(alt);
    expect([moved.tx, moved.ty]).toEqual([altTower.tx, altTower.ty]);
    expect(towersAt(m.world, from[0], from[1]).map((t) => t.tower)).toEqual([towersAt(m.world, from[0], from[1])[0]!.tower]);
    expect(eventsOf(m, 'mergePicked')[0]).toMatchObject({ changed: true, x: altTower.tx, y: altTower.ty, moved: true });
    expectStackRule(m);
  });

  it('무더기 안 + alt 무더기 없음: 빈 배치 칸으로 옮긴다', () => {
    const { m, res, alt } = blessedMergeIntoStack();
    for (const t of listTowers(m.world)) if (t.tower === alt) m.world.entities.remove(t.id);
    const from = [res.tx, res.ty] as const;
    command(m, { type: 'pickMerge', id: res.id, pick: 1 });
    const moved = m.world.entities.get(res.id) as Tower;
    expect(moved.tower).toBe(alt);
    expect([moved.tx, moved.ty]).not.toEqual([from[0], from[1]]);
    expect(towersAt(m.world, moved.tx, moved.ty)).toHaveLength(1);
    expectStackRule(m);
  });

  it('무더기 안 + 자리 없음: 바꾸지 않고 full로 거절, 선택은 사라지고 축복 1회를 돌려준다', () => {
    const { m, res, alt } = blessedMergeIntoStack();
    for (const t of listTowers(m.world)) if (t.tower === alt) m.world.entities.remove(t.id);
    // 남은 빈 칸을 모두 alt가 아닌 타워로 채운다 (가득 찬 노말 무더기 — 들어갈 자리가 없게)
    const filler = m.rules.baseDeck.normal[1]!;
    for (const [x, y] of m.map.buildable) {
      if (towersAt(m.world, x, y).length === 0) for (let i = 0; i < m.rules.stackMax; i++) placeTower(m.world, filler, 0, x, y);
    }
    const before = res.tower;
    const choices = m.state.perks[0]!.mergeChoices;
    eventsOf(m, 'x');
    command(m, { type: 'pickMerge', id: res.id, pick: 1 });
    expect((m.world.entities.get(res.id) as Tower).tower).toBe(before);
    expect(eventsOf(m, 'mergePickFail')[0]).toMatchObject({ reason: 'full', id: res.id });
    expect(m.state.mergePicks).toHaveLength(0);
    expect(m.state.perks[0]!.mergeChoices).toBe(choices + 1);
    expectStackRule(m);
  });

  it('혼자인 칸이면 예전처럼 그 자리에서 바꾼다', () => {
    const { m, res, alt } = blessedMergeIntoStack();
    // 결과와 같은 칸의 다른 타워를 지워 혼자로 만든다
    for (const t of towersAt(m.world, res.tx, res.ty)) if (t.id !== res.id) m.world.entities.remove(t.id);
    const at = [res.tx, res.ty];
    command(m, { type: 'pickMerge', id: res.id, pick: 1 });
    const t = m.world.entities.get(res.id) as Tower;
    expect(t.tower).toBe(alt);
    expect([t.tx, t.ty]).toEqual(at);
  });

  it('pick 0은 무더기 안이어도 그대로', () => {
    const { m, res } = blessedMergeIntoStack();
    const at = [res.tx, res.ty];
    const before = res.tower;
    command(m, { type: 'pickMerge', id: res.id, pick: 0 });
    const t = m.world.entities.get(res.id) as Tower;
    expect(t.tower).toBe(before);
    expect([t.tx, t.ty]).toEqual(at);
  });
});

describe('H1 뒷받침: 섞인 무더기는 무더기로 보지 않는다', () => {
  /** [X, Y, X] 섞인 칸을 강제로 만든다 (예전 버그가 만들던 모양). */
  function mixed(): { m: Match; x: number; y: number; X: string; Y: string } {
    const m = arena(1, { debug: true });
    const [x, y] = m.map.buildable[0]!;
    const X = m.rules.baseDeck.rare[0]!;
    const Y = m.rules.baseDeck.rare[1]!;
    placeTower(m.world, X, 0, x, y);
    placeTower(m.world, Y, 0, x, y);
    placeTower(m.world, X, 0, x, y);
    return { m, x, y, X, Y };
  }

  it('stackMergeCheck: 섞인 가득 찬 칸은 승급할 수 없다 (stack)', () => {
    const { m, x, y } = mixed();
    expect(stackMergeCheck(m.ctx, m.world, 0, x, y)).toEqual({ ok: false, reason: 'stack' });
  });

  it('fullStacks: 섞인 칸은 빼고 센다', () => {
    const { m } = mixed();
    expect(fullStacks(m.ctx, m.world, 0)).toHaveLength(0);
  });

  it('joinableStack: 섞인 칸에는 새 타워가 들어가지 않는다', () => {
    const m = arena(1, { debug: true });
    const [x, y] = m.map.buildable[0]!;
    const X = m.rules.baseDeck.rare[0]!;
    placeTower(m.world, X, 0, x, y);
    placeTower(m.world, m.rules.baseDeck.rare[1]!, 0, x, y);
    expect(joinableStack(m.ctx, m.world, 0, X)).toBeNull();
  });

  it('mergeStack 명령: 섞인 칸은 mergeFail stack, 상태 그대로', () => {
    const { m, x, y } = mixed();
    const n = listTowers(m.world).length;
    command(m, { type: 'mergeStack', x, y });
    expect(eventsOf(m, 'mergeFail')[0]).toMatchObject({ reason: 'stack' });
    expect(listTowers(m.world)).toHaveLength(n);
  });
});
