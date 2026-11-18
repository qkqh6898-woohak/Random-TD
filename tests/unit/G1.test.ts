/**
 * G-1 게임 시스템 (sim 규칙): 칸 무더기(한 칸에 같은 타워 최대 3개) · 연쇄 승급 · 소환 도박 4종 · 천장 · 3택 1 강화 선택 · 필살기 · 신화 조합.
 * 시험장(arena) = 예전 순환의 정원 v1(배치 71칸) — 칸 좌표가 흔들리지 않게. 진행도 3000 = 칸 (4, 1), 그 옆 (4, 2) 타워와 1칸.
 */
import { describe, expect, it } from 'vitest';
import { validatePayload } from '../../src/sim/Commands';
import { BP_ONE } from '../../src/sim/Fixed';
import { isTower, listTowers, topTowerAt, towersAt, type Tower } from '../../src/sim/entities/Tower';
import type { Match } from '../../src/sim/match';
import { createMatch } from '../../src/sim/match';
import { OPTIONAL_STATE_KEYS } from '../../src/sim/state';
import { GACHA_RANK, buildMatchRules, gradeRank, ultKindFor } from '../../src/sim/rules';
import { placeTower } from '../../src/sim/systems/Summon';
import { hasRoom, joinableStack, pityLeft, placementFor } from '../../src/sim/systems/Board';
import { fullStacks, stackMergeCheck } from '../../src/sim/systems/Merge';
import { factionPool, gachaOdds, gachaWeights } from '../../src/sim/systems/Gacha';
import { craftPlan, ownedCounts, recipeReady } from '../../src/sim/systems/Craft';
import { readyUlts, ultChargePerAttack, ultCheck, ultKindOf } from '../../src/sim/systems/Ultimate';
import { isPickStage } from '../../src/sim/systems/Cards';
import { computeAuras, towerBonus } from '../../src/sim/systems/Aura';
import { playReplay, recordReplay, replayToJson } from '../../src/sim/replay';
import { arena, arenaData, command, data, eventsOf, infinite, mobAt, realInfinite, runToStage } from '../helpers/match';

const rules = buildMatchRules(data);
const deck = rules.baseDeck;

/** 칸 (x, y)에 타워 id를 n개 쌓는다 (검사 없이). */
function stack(m: Match, id: string, x: number, y: number, n = 1, owner = 0): Tower[] {
  const out: Tower[] = [];
  for (let i = 0; i < n; i++) out.push(placeTower(m.world, id, owner, x, y));
  return out;
}

/** 칸마다 같은 타워만, board.stackMax 이하 (무더기 규칙). */
function expectStackRule(m: Match): void {
  const by = new Map<string, Tower[]>();
  for (const t of listTowers(m.world)) by.set(`${t.tx},${t.ty}`, [...(by.get(`${t.tx},${t.ty}`) ?? []), t]);
  for (const list of by.values()) {
    expect(list.length).toBeLessThanOrEqual(m.rules.stackMax);
    expect(new Set(list.map((t) => t.tower)).size).toBe(1);
  }
}

describe('데이터 (G-1)', () => {
  it('칸 쌓기 3 = 승급 개수, 연쇄 최대 12, 천장 30회 레어, 소환 도박 4종 확률 합 100%', () => {
    expect(rules.stackMax).toBe(3);
    expect(rules.mergeCount).toBe(rules.stackMax);
    expect(rules.mergeChainMax).toBe(12);
    expect(rules.summonPityN).toBe(30);
    expect(rules.summonPityRank).toBe(GACHA_RANK.rare);
    expect(rules.gachaKinds.map((k) => k.id)).toEqual(['lucky', 'faction', 'challenge', 'myth']);
    for (const k of rules.gachaKinds) expect(k.outcomes.reduce((a, o) => a + o.bp, 0)).toBe(BP_ONE);
    expect(rules.factionOrder).toHaveLength(7);
    expect(rules.recipes).toHaveLength(12);
    expect(gradeRank('hidden')).toBe(GACHA_RANK.legend);
  });

  it('필살기 종류: 광역 → 폭격, 지원·경제 → 가속, 마법 → 기절, 그 밖 → 폭격 (히어로 이상만)', () => {
    expect(ultKindOf({ rules }, 'miner')).toBeNull();
    expect(ultKindOf({ rules }, 'dragoncaller')).toBe('nuke');
    const u = data.game.ultimate.rules;
    expect(ultKindFor(u, { shape: 'single', tags: ['지원'], damageType: 'physical' })).toBe('rally');
    expect(ultKindFor(u, { shape: 'single', tags: [], damageType: 'magic' })).toBe('stun');
    expect(ultKindFor(u, { shape: 'single', tags: [], damageType: 'physical' })).toBe('nuke');
    for (const id of rules.ult.kindOf.keys()) expect(['hero', 'legend', 'god', 'hidden']).toContain(rules.towers.get(id)?.grade);
  });

  it('새 명령 내용 검사', () => {
    expect(validatePayload({ type: 'summonAuto' })).toBeNull();
    expect(validatePayload({ type: 'summonPad', x: 1, y: 2 })).toBeNull();
    expect(validatePayload({ type: 'mergeStack', x: 1, y: 2 })).toBeNull();
    expect(validatePayload({ type: 'moveStack', fx: 1, fy: 2, tx: 3, ty: 4 })).toBeNull();
    expect(validatePayload({ type: 'gacha', k: 1, f: 3 })).toBeNull();
    expect(validatePayload({ type: 'gacha', k: 1 })).toMatch(/f가/);
    expect(validatePayload({ type: 'craft', r: 0 })).toBeNull();
    expect(validatePayload({ type: 'ult', id: 0 })).toMatch(/id가/);
    expect(validatePayload({ type: 'summonAuto', x: 1 })).toMatch(/모르는 필드/);
  });

  it('새 판 상태 필드는 늘 있다 (저장 복원 검사의 선택 필드가 아님)', () => {
    const m = realInfinite(3);
    expect(m.state.pity).toEqual([[0, 0, 0, 0, 0]]);
    expect(m.state.pityCut).toEqual([0]);
    expect(OPTIONAL_STATE_KEYS).not.toContain('pity');
  });
});

describe('칸 무더기 소환 (summonAuto · summonPad)', () => {
  it('같은 타워는 덜 찬 무더기에 먼저 쌓이고, 칸마다 같은 타워만 3개까지', () => {
    const m = arena(5);
    m.state.gold = 100_000;
    m.state.unitCapBonus[0] = 100; // 인원 한도는 따로 본다
    for (let i = 0; i < 40; i++) command(m, { type: 'summonAuto' });
    expect(listTowers(m.world)).toHaveLength(40);
    expectStackRule(m);
    // 타워 종류마다 덜 찬 무더기는 하나뿐 (새 타워가 늘 덜 찬 칸부터 채운다)
    const partial = new Map<string, number>();
    const by = new Map<string, Tower[]>();
    for (const t of listTowers(m.world)) by.set(`${t.tx},${t.ty}`, [...(by.get(`${t.tx},${t.ty}`) ?? []), t]);
    for (const list of by.values()) if (list.length < 3) partial.set(list[0]!.tower, (partial.get(list[0]!.tower) ?? 0) + 1);
    for (const n of partial.values()) expect(n).toBe(1);
    expect(m.state.summons).toBe(40);
  });

  it('summonPad: 같은 타워 무더기가 없으면 누른 빈 칸, 있으면 그 무더기', () => {
    const m = arena(7);
    const [x, y] = m.map.buildable[10]!;
    command(m, { type: 'summonPad', x, y });
    const first = topTowerAt(m.world, x, y)!;
    expect(first).toBeDefined();
    // 같은 타워를 다른 칸에 쌓아 두면 다음 같은 타워는 그 칸으로 (placementFor)
    expect(placementFor(m.ctx, m.world, 0, first.tower, m.map.buildable[20]!)).toEqual([x, y]);
    expect(placementFor(m.ctx, m.world, 0, deck.normal.find((id) => id !== first.tower)!, m.map.buildable[20]!)).toEqual(m.map.buildable[20]);
  });

  it('빈 칸이 없고 들어갈 무더기도 없으면 돈을 내지 않고 실패 (full)', () => {
    const m = realInfinite(9);
    m.state.unitCapBonus[0] = 1000; // 인원 한도는 따로 본다
    // 모든 칸을 가득 찬 노말 무더기로 (서로 다른 2종 번갈아)
    m.map.buildable.forEach(([x, y], i) => stack(m, deck.normal[i % 2]!, x, y, 3));
    expect(hasRoom(m.ctx, m.world, 0)).toBe(false);
    const gold = m.state.gold;
    command(m, { type: 'summonAuto' });
    expect(eventsOf(m, 'summonFail').at(-1)?.reason).toBe('full');
    expect(m.state.gold).toBe(gold);
  });

  it('자리는 있지만 굴린 타워가 들어갈 칸이 없으면 돈을 내지 않는다', () => {
    const m = realInfinite(11);
    m.state.unitCapBonus[0] = 1000;
    const pads = m.map.buildable;
    pads.forEach(([x, y], i) => stack(m, deck.normal[0]!, x, y, i === 0 ? 2 : 3));
    expect(hasRoom(m.ctx, m.world, 0)).toBe(true);
    const gold = m.state.gold;
    let placed = 0;
    for (let i = 0; i < 12; i++) {
      const before = listTowers(m.world).length;
      command(m, { type: 'summonAuto' });
      if (listTowers(m.world).length > before) placed++;
    }
    expect(placed).toBe(1); // 덜 찬 무더기 하나에 같은 타워가 나왔을 때만
    expect(m.state.gold).toBe(gold - m.rules.summonCost);
  });

  it('인원 한도 (board.unitCap 20 + 카드 부대 확장): 내 타워가 한도면 소환·소환 도박 모두 cap, 돈은 그대로 · 승급하면 다시', () => {
    const m = realInfinite(19);
    m.state.gold = 100_000;
    expect(rules.unitCap).toBe(20);
    for (let i = 0; i < 25; i++) command(m, { type: 'summonAuto' });
    expect(listTowers(m.world)).toHaveLength(20);
    expect(eventsOf(m, 'summonFail').at(-1)?.reason).toBe('cap');
    const gold = m.state.gold;
    command(m, { type: 'gacha', k: 0, f: 0 });
    expect(eventsOf(m, 'gachaFail').at(-1)?.reason).toBe('cap');
    expect(m.state.gold).toBe(gold);
    // 카드 '부대 확장' +3
    m.state.debug = true;
    command(m, { type: 'debugCard', c: rules.cards.findIndex((c) => c.id === 'pickCap') });
    expect(m.state.unitCapBonus[0]).toBe(3);
    command(m, { type: 'summonAuto' });
    expect(listTowers(m.world)).toHaveLength(21);
  });

  it('일반 소환 천장: 레어 이상 없이 30회면 다음 소환은 레어, 카운터는 0으로 · 카드 행운 부적은 천장을 줄인다', () => {
    const m = arena(13);
    m.state.gold = 100_000;
    m.state.pity[0]![0] = 29;
    expect(pityLeft(m.ctx, 0, 0, rules.summonPityN)).toBe(1);
    command(m, { type: 'summonAuto' });
    const ev = eventsOf(m, 'summon').at(-1)!;
    expect(ev.grade).toBe('normal');
    expect(m.state.pity[0]![0]).toBe(30);
    expect(pityLeft(m.ctx, 0, 0, rules.summonPityN)).toBe(0);
    command(m, { type: 'summonAuto' });
    const ev2 = eventsOf(m, 'summon').at(-1)!;
    expect(ev2.grade).toBe('rare');
    expect(ev2.pity).toBe(true);
    expect(m.state.pity[0]![0]).toBe(0);
    m.state.pityCut[0] = 5;
    expect(pityLeft(m.ctx, 0, 0, rules.summonPityN)).toBe(25);
    m.state.pityCut[0] = 100;
    expect(pityLeft(m.ctx, 0, 0, rules.summonPityN)).toBe(1); // 최소 1
  });

  it('예전 summon {x, y}는 그대로: 빈 칸에만, 같은 타워가 있어도 쌓지 않고 천장도 세지 않는다', () => {
    const m = arena(15);
    const [x, y] = m.map.buildable[3]!;
    command(m, { type: 'summon', x, y });
    command(m, { type: 'summon', x, y });
    expect(towersAt(m.world, x, y)).toHaveLength(1);
    expect(eventsOf(m, 'summonFail').at(-1)?.reason).toBe('occupied');
    expect(m.state.pity[0]![0]).toBe(0);
  });
});

describe('무더기 승급 · 연쇄 승급 (mergeStack)', () => {
  it('가득 찬 무더기만 승급 (덜 차면 stack), 결과는 같은 타워 무더기에 합류, 없으면 그 칸', () => {
    const m = arena(17);
    const [ax, ay] = m.map.buildable[0]!;
    const [bx, by] = m.map.buildable[30]!;
    stack(m, 'archer', ax, ay, 2);
    expect(stackMergeCheck(m.ctx, m.world, 0, ax, ay)).toEqual({ ok: false, reason: 'stack' });
    stack(m, 'archer', ax, ay, 1);
    expect(stackMergeCheck(m.ctx, m.world, 0, ax, ay).ok).toBe(true);
    command(m, { type: 'mergeStack', x: ax, y: ay });
    const merges = eventsOf(m, 'merge');
    expect(merges).toHaveLength(1);
    const result = m.world.entities.get(Number(merges[0]!.id)) as Tower;
    expect(rules.towers.get(result.tower)?.grade).toBe('rare');
    expect([result.tx, result.ty]).toEqual([ax, ay]);
    // 같은 레어를 다른 칸에 하나 두면 다음 결과는 그 칸으로 간다
    stack(m, 'archer', ax, ay, 0);
    const m2 = arena(17);
    stack(m2, 'archer', ax, ay, 3);
    stack(m2, result.tower, bx, by, 1);
    command(m2, { type: 'mergeStack', x: ax, y: ay });
    const ev = eventsOf(m2, 'merge')[0]!;
    if (ev.tower === result.tower) {
      expect([ev.x, ev.y]).toEqual([bx, by]);
      expect(towersAt(m2.world, ax, ay)).toHaveLength(0);
      expect(String(ev.removed).split(';')).toContain(`${ax},${ay}`);
    }
    expectStackRule(m2);
  });

  it('연쇄: 같은 타워 가득 찬 무더기가 여럿이면 이어서, 결과 무더기가 가득 차면 그 타워로 이어 간다 (단계마다 merge 사건 + mergeChain)', () => {
    const m = arena(19);
    const pads = m.map.buildable;
    for (let i = 0; i < 3; i++) stack(m, 'goblin', pads[i]![0], pads[i]![1], 3);
    // 레어 결과가 모일 자리: 덱 레어 5종 각각 2개씩 미리 쌓아 둔다 → 레어 결과가 그 무더기를 채우면 이어서 유니크로
    deck.rare.forEach((id, i) => stack(m, id, pads[10 + i]![0], pads[10 + i]![1], 2));
    const merges0 = m.state.merges;
    command(m, { type: 'mergeStack', x: pads[0]![0], y: pads[0]![1] });
    const merges = eventsOf(m, 'merge');
    expect(merges.length).toBeGreaterThanOrEqual(4); // 고블린 3묶음 + 가득 찬 레어 무더기 하나 이상
    expect(m.state.merges - merges0).toBe(merges.length);
    expect(merges.slice(0, 3).every((e) => e.fromTower === 'goblin')).toBe(true);
    expect(rules.towers.get(String(merges[3]!.fromTower))?.grade).toBe('rare');
    expectStackRule(m);
  });

  it('연쇄 승급 최대 merge.chainMax번 · mergeChain 사건', () => {
    const m = arena(21);
    const pads = m.map.buildable;
    for (let i = 0; i < 15; i++) stack(m, 'goblin', pads[i]![0], pads[i]![1], 3);
    command(m, { type: 'mergeStack', x: pads[0]![0], y: pads[0]![1] });
    const evs = m.world.drainEvents();
    const merges = evs.filter((e) => e.type === 'merge');
    expect(merges).toHaveLength(rules.mergeChainMax);
    expect(evs.find((e) => e.type === 'mergeChain')).toMatchObject({ steps: rules.mergeChainMax });
    expect(fullStacks(m.ctx, m.world, 0, 'goblin').length).toBeGreaterThan(0);
  });

  it('레전드는 승급할 수 없다 (maxGrade), 남의 칸은 notOwner', () => {
    const m = arena(23, { players: 2 });
    const [x, y] = m.map.buildable[5]!;
    stack(m, 'fortuna', x, y, 3);
    expect(stackMergeCheck(m.ctx, m.world, 0, x, y)).toEqual({ ok: false, reason: 'maxGrade' });
    const [x2, y2] = m.map.buildable[6]!;
    stack(m, 'goblin', x2, y2, 3, 1);
    expect(stackMergeCheck(m.ctx, m.world, 0, x2, y2)).toEqual({ ok: false, reason: 'notOwner' });
  });
});

describe('무더기 이동·교환·합치기 · 판매 · 끌기', () => {
  it('빈 칸으로 통째 이동, 다른 무더기와 교환, 같은 타워끼리 3개 이하면 합침', () => {
    const m = arena(25);
    const p = m.map.buildable;
    stack(m, 'goblin', p[0]![0], p[0]![1], 2);
    stack(m, 'archer', p[1]![0], p[1]![1], 3);
    stack(m, 'goblin', p[2]![0], p[2]![1], 1);
    command(m, { type: 'moveStack', fx: p[0]![0], fy: p[0]![1], tx: p[5]![0], ty: p[5]![1] });
    expect(towersAt(m.world, p[5]![0], p[5]![1])).toHaveLength(2);
    expect(towersAt(m.world, p[0]![0], p[0]![1])).toHaveLength(0);
    command(m, { type: 'moveStack', fx: p[5]![0], fy: p[5]![1], tx: p[1]![0], ty: p[1]![1] });
    expect(towersAt(m.world, p[1]![0], p[1]![1]).map((t) => t.tower)).toEqual(['goblin', 'goblin']);
    expect(towersAt(m.world, p[5]![0], p[5]![1]).map((t) => t.tower)).toEqual(['archer', 'archer', 'archer']);
    command(m, { type: 'moveStack', fx: p[2]![0], fy: p[2]![1], tx: p[1]![0], ty: p[1]![1] });
    expect(towersAt(m.world, p[1]![0], p[1]![1])).toHaveLength(3);
    expect(eventsOf(m, 'move').at(-1)?.merged).toBe(true);
    expectStackRule(m);
  });

  it('판매는 맨 위 하나, 끌기(hold)는 무더기 전체', () => {
    const m = arena(27);
    const [x, y] = m.map.buildable[4]!;
    const ts = stack(m, 'goblin', x, y, 3);
    command(m, { type: 'hold', x, y, on: 1 });
    expect(towersAt(m.world, x, y).every((t) => t.held)).toBe(true);
    command(m, { type: 'hold', x, y, on: 0 });
    command(m, { type: 'sellTower', x, y });
    expect(towersAt(m.world, x, y).map((t) => t.id)).toEqual([ts[0]!.id, ts[1]!.id]);
  });
});

describe('소환 도박 4종 · 천장', () => {
  it('확률표: 천장이면 천장 등급 미만은 0, 화면 확률은 합 100%', () => {
    const myth = rules.gachaKinds[3]!;
    expect(gachaWeights(myth, false)).toEqual([9160, 800, 40]);
    expect(gachaWeights(myth, true)).toEqual([0, 800, 40]);
    const odds = gachaOdds(myth, true);
    expect(odds.reduce((a, o) => a + o.bp, 0)).toBe(BP_ONE);
    expect(odds[0]!.bp).toBe(0);
  });

  it('종족 소환 후보: 덱에 그 종족이 없으면 전체에서, 그 등급이 없으면 한 등급 위 (요정 노말 → 레어)', () => {
    expect(factionPool(rules, deck, 'dwarf', 'normal')).toEqual(['miner']);
    const fairy = factionPool(rules, deck, 'fairy', 'normal');
    expect(fairy.length).toBeGreaterThan(0);
    for (const id of fairy) {
      expect(rules.towers.get(id)?.faction).toBe('fairy');
      expect(rules.towers.get(id)?.grade).toBe('rare');
    }
  });

  it('신화 도박 천장: 25번 레전드 없이 → 다음은 레전드 이상, 카운터 0', () => {
    const m = arena(29);
    m.state.gold = 1_000_000;
    m.state.pity[0]![4] = 25;
    command(m, { type: 'gacha', k: 3, f: 0 });
    const g = eventsOf(m, 'gacha').at(-1)!;
    expect(['legend', 'god']).toContain(g.grade);
    expect(g.pity).toBe(true);
    expect(m.state.pity[0]![4]).toBe(0);
    expect(m.state.gold).toBe(1_000_000 - rules.gachaKinds[3]!.cost);
  });

  it('등급 도전: 꽝이면 돈만 내고 타워 없음, 카운터 +1 · 여러 번 돌리면 유니크 이상도 나온다', () => {
    const m = arena(31);
    m.state.gold = 1_000_000;
    let none = 0;
    let hit = 0;
    for (let i = 0; i < 40; i++) {
      const before = listTowers(m.world).length;
      command(m, { type: 'gacha', k: 2, f: 0 });
      const g = eventsOf(m, 'gacha').at(-1)!;
      if (g.grade === 'none') {
        none++;
        expect(listTowers(m.world)).toHaveLength(before);
      } else {
        hit++;
        expect(gradeRank(g.grade as never)).toBeGreaterThanOrEqual(GACHA_RANK.unique);
      }
    }
    expect(none).toBeGreaterThan(0);
    expect(hit).toBeGreaterThan(0);
    expect(m.state.gachas).toBe(40);
    expectStackRule(m);
  });

  it('종족 소환: 고른 종족만 나온다', () => {
    const m = arena(33);
    m.state.gold = 1_000_000;
    const f = rules.factionOrder.indexOf('kingdom');
    for (let i = 0; i < 12; i++) command(m, { type: 'gacha', k: 1, f });
    const got = eventsOf(m, 'gacha');
    expect(got).toHaveLength(12);
    for (const g of got) expect(rules.towers.get(String(g.tower))?.faction).toBe('kingdom');
  });

  it('돈이 모자라면 gold, 없는 종류는 unknown (상태 그대로)', () => {
    const m = arena(35);
    m.state.gold = 10;
    command(m, { type: 'gacha', k: 0, f: 0 });
    command(m, { type: 'gacha', k: 7, f: 0 });
    expect(eventsOf(m, 'gachaFail').map((e) => e.reason)).toEqual(['gold', 'unknown']);
    expect(m.state.gold).toBe(10);
  });
});

describe('3택 1 강화 선택', () => {
  it('5·15·25 … 단계 (보스 단계 제외)', () => {
    expect([5, 15, 25, 35].every((s) => isPickStage(rules, s))).toBe(true);
    expect([1, 4, 6, 10, 20, 30].some((s) => isPickStage(rules, s))).toBe(false);
  });

  it('5단계 시작에 강화 카드 3장 (pick 묶음) → pickCard로 고르고 효과 (공속·천장·필살기 충전)', () => {
    const m = realInfinite(37);
    runToStage(m, 5);
    const offer = m.state.cardOffers[0]!;
    expect(offer.stage).toBe(5);
    expect(offer.cards).toHaveLength(3);
    for (const id of offer.cards) expect(rules.cardById.get(id)?.pools).toContain('pick');
    command(m, { type: 'pickCard', i: 0 });
    expect(m.state.cardOffers).toHaveLength(0);
    // 새 효과를 직접 확인
    const m2 = realInfinite(37, { debug: true });
    const idx = (id: string): number => rules.cards.findIndex((c) => c.id === id);
    command(m2, { type: 'debugCard', c: idx('pickAps') });
    expect(m2.state.mods[0]!.apsPctBp).toBe(1000);
    command(m2, { type: 'debugCard', c: idx('pickPity') });
    expect(m2.state.pityCut[0]).toBe(5);
    command(m2, { type: 'debugCard', c: idx('pickUlt') });
    expect(m2.state.ultChargeBp[0]).toBe(2500);
  });

  it('보스 카드 묶음은 예전 12장에서만 나온다', () => {
    for (const c of rules.cards) if (c.id.startsWith('pick')) expect(c.pools).toEqual(['pick']);
  });
});

describe('필살기', () => {
  it('히어로 이상은 공격마다 게이지가 차고, 가득 차면 ult 명령으로 발동 (폭격: 둘레 몹 피해)', () => {
    const m = arena(39);
    const t = stack(m, 'swordsaint', 4, 2, 1)[0]!;
    expect(ultChargePerAttack(m.ctx, t)).toBe(Math.floor(BP_ONE / 40));
    const mob = mobAt(m, 'slime', 3000);
    mob.hp = 10_000_000;
    m.stepN(30);
    expect(t.ult ?? 0).toBeGreaterThan(0);
    expect(ultCheck(m.ctx, m.world, 0, t.id)).toBe('charge');
    t.ult = BP_ONE;
    expect(readyUlts(m.ctx, m.world, 0).map((x) => x.id)).toEqual([t.id]);
    const hp = mob.hp;
    command(m, { type: 'ult', id: t.id });
    const ev = eventsOf(m, 'ult')[0]!;
    expect(ev.kind).toBe(ultKindOf(m.ctx, 'swordsaint'));
    expect(t.ult).toBe(0);
    if (ev.kind === 'nuke') expect(mob.hp).toBeLessThan(hp);
    expect(m.state.ults).toBe(1);
  });

  it('기절: 둘레 몹이 기절 · 가속: 모든 타워 공속 +50% 8초 뒤 끝 · 필살기 없는 타워는 none', () => {
    const m = arena(41);
    const stunId = [...rules.ult.kindOf].find(([, k]) => k === 'stun')![0];
    const rallyId = [...rules.ult.kindOf].find(([, k]) => k === 'rally')![0];
    const s = stack(m, stunId, 4, 2, 1)[0]!;
    const r = stack(m, rallyId, 4, 0, 1)[0]!;
    const g = stack(m, 'goblin', 5, 0, 1)[0]!;
    const mob = mobAt(m, 'slime', 3000);
    s.ult = BP_ONE;
    r.ult = BP_ONE;
    command(m, { type: 'ult', id: s.id });
    expect(mob.stunUntil).toBeGreaterThan(m.tick);
    const before = towerBonus(m.ctx, g, computeAuras(m.ctx, m.world)).apsPctBp;
    command(m, { type: 'ult', id: r.id });
    expect(towerBonus(m.ctx, g, computeAuras(m.ctx, m.world)).apsPctBp - before).toBe(rules.ult.rallyApsBp);
    m.stepN(rules.ult.rallyTicks);
    expect(m.state.rallyBp[0]).toBe(0);
    command(m, { type: 'ult', id: g.id });
    expect(eventsOf(m, 'ultFail').at(-1)?.reason).toBe('none');
  });

  it('카드 투지: 충전 +25%', () => {
    const m = arena(43);
    const t = stack(m, 'swordsaint', 4, 2, 1)[0]!;
    const base = ultChargePerAttack(m.ctx, t);
    m.state.ultChargeBp[0] = 2500;
    expect(ultChargePerAttack(m.ctx, t)).toBe(Math.floor((base * 12500) / 10000));
  });
});

describe('신화 조합 (craft)', () => {
  it('재료가 모두 판 위에 있으면 만든다: 재료는 사라지고 결과는 비게 되는 첫 재료 칸 · craft 사건', () => {
    const m = arena(45);
    const r = rules.recipes.findIndex((x) => x.id === 'goldking');
    const recipe = rules.recipes[r]!;
    const p = m.map.buildable;
    recipe.materials.forEach((id, i) => stack(m, id, p[i]![0], p[i]![1], 1));
    expect(recipeReady(recipe.materials, ownedCounts(m.world, 0))).toBe(true);
    command(m, { type: 'craft', r });
    const ev = eventsOf(m, 'craft')[0]!;
    expect(ev).toMatchObject({ tower: 'goldking', x: p[0]![0], y: p[0]![1] });
    const left = listTowers(m.world);
    expect(left.map((t) => t.tower)).toEqual(['goldking']);
    expect(m.state.crafts).toBe(1);
  });

  it('같은 재료 여럿 (고블린 대왕 = 고블린 3) · 모자라면 material', () => {
    const m = arena(47);
    const r = rules.recipes.findIndex((x) => x.id === 'goblinking');
    const p = m.map.buildable;
    stack(m, 'goblin', p[0]![0], p[0]![1], 2);
    stack(m, 'cleaver', p[1]![0], p[1]![1], 1);
    stack(m, 'goblinchief', p[2]![0], p[2]![1], 1);
    expect(craftPlan(m.ctx, m.world, 0, r)).toEqual({ ok: false, reason: 'material' });
    stack(m, 'goblin', p[0]![0], p[0]![1], 1);
    const plan = craftPlan(m.ctx, m.world, 0, r);
    expect(plan.ok).toBe(true);
    command(m, { type: 'craft', r });
    expect(listTowers(m.world).map((t) => t.tower)).toEqual(['goblinking']);
  });

  it('무더기 안 재료는 맨 위(나중 것)부터 · 칸이 비지 않으면 빈 칸에', () => {
    const m = arena(49);
    const r = rules.recipes.findIndex((x) => x.id === 'goldking');
    const p = m.map.buildable;
    const miners = stack(m, 'miner', p[0]![0], p[0]![1], 3);
    stack(m, 'merchant', p[1]![0], p[1]![1], 2);
    stack(m, 'alchemist', p[2]![0], p[2]![1], 1);
    command(m, { type: 'craft', r });
    const ev = eventsOf(m, 'craft')[0]!;
    expect([ev.x, ev.y]).toEqual([p[2]![0], p[2]![1]]); // 비게 되는 칸 = 연금술사 칸
    expect(towersAt(m.world, p[0]![0], p[0]![1]).map((t) => t.id)).toEqual([miners[0]!.id, miners[1]!.id]);
  });

  it('G-3 잠긴 신화 (isHiddenLocked): 재료가 모여도 locked로 실패, 도감에 🔒 해방 필요 (조각 n/20) · 기본(목록 없음)은 모두 열림', async () => {
    const { isHiddenLocked } = await import('../../src/sim/unlocks');
    const { codexSheetModel } = await import('../../src/ui/sheets/g1Models');
    const m = arena(51);
    const r = rules.recipes.findIndex((x) => x.id === 'goldking');
    const p = m.map.buildable;
    stack(m, 'miner', p[0]![0], p[0]![1]);
    stack(m, 'merchant', p[1]![0], p[1]![1]);
    stack(m, 'alchemist', p[2]![0], p[2]![1]);
    expect(isHiddenLocked(m.ctx, 0, 'goldking')).toBe(false);
    expect(craftPlan(m.ctx, m.world, 0, r).ok).toBe(true);
    // G-3 갈래가 MatchContext.lockedHidden(플레이어별 Set)을 더한다 — 같은 모양으로 넣어 본다
    (m.ctx as unknown as { lockedHidden: ReadonlySet<string>[] }).lockedHidden = [new Set(['goldking'])];
    expect(isHiddenLocked(m.ctx, 0, 'goldking')).toBe(true);
    expect(isHiddenLocked(m.ctx, 1, 'goldking')).toBe(false);
    expect(craftPlan(m.ctx, m.world, 0, r)).toEqual({ ok: false, reason: 'locked' });
    command(m, { type: 'craft', r });
    expect(eventsOf(m, 'craftFail')[0]).toMatchObject({ reason: 'locked' });
    expect(m.state.crafts).toBe(0);
    const row = codexSheetModel(m.ctx, m.world, 0, data.towers.towers, new Set(['goldking']), () => ({ have: 7, need: 20 })).rows.find((x) => x.id === 'goldking')!;
    expect(row).toMatchObject({ locked: true, craftable: false, note: '🔒 해방 필요 (조각 7/20)' });
    const plain = codexSheetModel(m.ctx, m.world, 0, data.towers.towers, new Set()).rows.find((x) => x.id === 'goldking')!;
    expect(plain.note).toBe('🔒 해방 필요');
  });
});

describe('결정성: 새 명령이 든 판의 리플레이 왕복·저장 복원', () => {
  it('summonAuto·mergeStack·moveStack·gacha·craft·ult·pickCard → 기록 → JSON → 재생 = 같은 해시', () => {
    const m = infinite(51, { debug: true });
    command(m, { type: 'debugAddGold', amount: 500_000 });
    for (let i = 0; i < 12; i++) command(m, { type: 'summonAuto' });
    const full = fullStacks(m.ctx, m.world, 0)[0];
    if (full) command(m, { type: 'mergeStack', x: full[0]!.tx, y: full[0]!.ty });
    command(m, { type: 'gacha', k: 0, f: 0 });
    command(m, { type: 'gacha', k: 1, f: 2 });
    command(m, { type: 'gacha', k: 3, f: 0 });
    const any = listTowers(m.world)[0]!;
    const free = m.map.buildable.find(([x, y]) => towersAt(m.world, x, y).length === 0)!;
    command(m, { type: 'moveStack', fx: any.tx, fy: any.ty, tx: free[0], ty: free[1] });
    command(m, { type: 'craft', r: 0 });
    m.stepN(200);
    const file = recordReplay(arenaData, m, { name: 'g1-roundtrip' });
    const back = JSON.parse(replayToJson(file));
    const r = playReplay(arenaData, back);
    expect(r.mismatch).toBeNull();
    expect(r.hash).toBe(m.hash());
  });

  it('joinableStack은 곧 사라질 재료를 빼고 센다', () => {
    const m = arena(53);
    const [x, y] = m.map.buildable[0]!;
    const ts = stack(m, 'goblin', x, y, 3);
    expect(joinableStack(m.ctx, m.world, 0, 'goblin')).toBeNull();
    expect(joinableStack(m.ctx, m.world, 0, 'goblin', new Set([ts[2]!.id]))).toEqual([x, y]);
    expect(createMatch(data, { seed: 1, mode: 'infinite' }).towers().filter((t) => isTower(t))).toHaveLength(0);
  });
});

describe('G-1 화면 모델 (순수)', () => {
  it('칸 무더기 그리기 자리: 1개 가운데·크기 1, 2개 좌우, 3개 삼각형 (뒤 가운데 + 앞 둘)', async () => {
    const { stackSlot } = await import('../../src/view/render/stackGeom');
    expect(stackSlot(0, 1)).toEqual({ dx: 0, dy: 0, scale: 1 });
    expect(stackSlot(0, 2).dx).toBeLessThan(0);
    expect(stackSlot(1, 2).dx).toBeGreaterThan(0);
    const three = [0, 1, 2].map((i) => stackSlot(i, 3));
    expect(three[0]!.dy).toBeLessThan(three[1]!.dy);
    expect(three.every((s) => s.scale < stackSlot(0, 2).scale)).toBe(true);
  });

  it("무더기 칸 너비 상한 (사용자 '3개 무더기 겹침'): 2·3개는 혼자일 때 2배 크기여도 무더기 전체가 칸(+0.06칸) 안", async () => {
    const { stackSlot, stackArtScale, STACK_HALF_W_PER_ART, STACK_OVERHANG_TILES } = await import('../../src/view/render/stackGeom');
    // 1개는 상한 없음 — 예전 크기 그대로
    expect(stackArtScale(2, stackSlot(0, 1))).toBe(2);
    expect(stackArtScale(1.4, stackSlot(0, 1))).toBe(1.4);
    for (const n of [2, 3]) {
      for (const solo of [2, 1.4, 1]) {
        for (let i = 0; i < n; i++) {
          const slot = stackSlot(i, n);
          const art = stackArtScale(solo, slot);
          expect(art).toBeLessThanOrEqual(solo * slot.scale + 1e-9);
          // 그림 바깥 끝 = |dx| + 반폭 ≤ 칸 반폭 + 여유
          expect(Math.abs(slot.dx) + art * STACK_HALF_W_PER_ART).toBeLessThanOrEqual(0.5 + STACK_OVERHANG_TILES + 1e-9);
        }
      }
    }
    // 예전 3개 무더기(2배 × 0.68 = 1.36, dx 0.24)는 바깥 끝이 약 0.87칸 — 지금은 상한으로 줄어든다
    expect(stackArtScale(2, stackSlot(1, 3))).toBeLessThan(0.9);
    // 같은 무더기는 같은 크기 (뒤 가운데도 앞 양옆과 같게)
    const three = [0, 1, 2].map((i) => stackArtScale(2, stackSlot(i, 3)));
    expect(new Set(three).size).toBe(1);
  });

  it('소환 시트: 확률 줄·천장 글자·버튼 상태', async () => {
    const { summonSheetModel, oddsLine } = await import('../../src/ui/sheets/g1Models');
    const m = realInfinite(61);
    const factions = rules.factionOrder.map((id) => ({ id, name: id, color: '#fff' }));
    const model = summonSheetModel(m.ctx, m.world, 0, factions, 2, data.game.summonGamble.kinds);
    expect(model.normal.pity).toBe('천장까지 30회 (레어)');
    expect(model.rows.map((r) => r.odds)).toEqual([
      '노말 55% · 레어 35% · 유니크 10%',
      '노말 70% · 레어 30%',
      '꽝 75% · 유니크 22% · 히어로 3%',
      '노말\u00a091.6% · 레전드\u00a08% · 신\u00a00.4%',
    ]);
    expect(model.rows[3]!.state).toBe('ok');
    m.state.pity[0]![4] = 25;
    const hot = summonSheetModel(m.ctx, m.world, 0, factions, 2, data.game.summonGamble.kinds);
    expect(hot.rows[3]!.pity).toBe('다음 1회 레전드 확정!');
    expect(hot.rows[3]!.odds).toBe('레전드 95.23% · 신 4.77%');
    m.state.gold = 0;
    expect(summonSheetModel(m.ctx, m.world, 0, factions, 2, data.game.summonGamble.kinds).normal.state).toBe('gold');
    expect(oddsLine([{ grade: 'none', bp: 0 }, { grade: 'rare', bp: 10000 }])).toBe('레어 100%');
  });

  it('신화 도감: 발견 전 ??? + 힌트 재료 하나, 발견하면 이름·재료·[제작], 재료가 모이면 새로 발견', async () => {
    const { codexSheetModel, hintMaterial, newlyDiscovered } = await import('../../src/ui/sheets/g1Models');
    const m = arena(63);
    const towers = data.towers.towers;
    const none = codexSheetModel(m.ctx, m.world, 0, towers, new Set());
    expect(none.summary).toBe('발견 0/12');
    const gk = none.rows.find((r) => r.id === 'goldking')!;
    expect(gk.name).toBe('???');
    expect(gk.materials.map((x) => x.name)).toEqual(['???', '???', '연금술사']); // 힌트 = 등급이 가장 높은 재료 (히어로 연금술사)
    expect(gk.craftable).toBe(false);
    expect(hintMaterial(['a', 'b', 'c'], (id) => ({ a: 1, b: 3, c: 3 })[id] ?? 0)).toBe(1);
    const p = m.map.buildable;
    stack(m, 'miner', p[0]![0], p[0]![1]);
    stack(m, 'merchant', p[1]![0], p[1]![1]);
    stack(m, 'alchemist', p[2]![0], p[2]![1]);
    expect(newlyDiscovered(m.rules, ownedCounts(m.world, 0), new Set())).toEqual(['goldking']);
    const found = codexSheetModel(m.ctx, m.world, 0, towers, new Set(['goldking']));
    const row = found.rows.find((r) => r.id === 'goldking')!;
    expect(row.name).toBe('황금 왕');
    expect(row.materials.every((x) => x.onBoard)).toBe(true);
    expect(row.craftable).toBe(true);
    expect(found.ready).toBe(1);
  });

  it('계정 도감 기록: 예전 저장(도감 없음)도 읽고, 새로 기록하면 칸 객체로 남는다 (G-3 잠김/해방 필드를 더할 수 있게)', async () => {
    const { createAccountStore, ACCOUNT_KEY } = await import('../../src/meta/account');
    const { MemoryStorage } = await import('../../src/save/storage');
    const st = new MemoryStorage();
    st.setItem(ACCOUNT_KEY, JSON.stringify({ v: 1, level: 3, hidden: ['h01'], guides: ['firstMerge'] }));
    const a = createAccountStore(st);
    expect(a.level()).toBe(3);
    expect(a.codexFound().size).toBe(0);
    expect(a.recordCodex('goldking')).toBe(true);
    expect(a.recordCodex('goldking')).toBe(false);
    const saved = JSON.parse(st.getItem(ACCOUNT_KEY)!);
    expect(saved).toMatchObject({ level: 3, hidden: ['h01'], guides: ['firstMerge'], codex: { goldking: { found: true } } });
    // 모르는 필드는 그대로 둔다 (나중 버전이 더한 값)
    st.setItem(ACCOUNT_KEY, JSON.stringify({ ...saved, codex: { goldking: { found: true, unlocked: 2 } } }));
    const b = createAccountStore(st);
    b.recordCodex('festival');
    expect(JSON.parse(st.getItem(ACCOUNT_KEY)!).codex).toEqual({ festival: { found: true }, goldking: { found: true, unlocked: 2 } });
  });

  it('3택 1 고르기 창 제목·부제, 연쇄 승급·천장 글자', async () => {
    const { cardChoiceModel } = await import('../../src/ui/panels/choiceModel');
    const { chainMergeText, pityText } = await import('../../src/ui/messages');
    const pick = cardChoiceModel(rules, { player: 0, boss: 1, cards: ['pickAtk', 'pickAps', 'pickUlt'], stage: 15 });
    expect(pick.title).toBe('✨ 강화 카드 1장을 고르세요');
    expect(pick.sub).toContain('15단계');
    expect(pick.key).not.toBe(cardChoiceModel(rules, { player: 0, boss: 1, cards: ['pickAtk', 'pickAps', 'pickUlt'] }).key);
    expect(chainMergeText(3)).toBe('연쇄 승급 ×3!');
    expect(pityText(7, '레어')).toBe('천장까지 7회');
    expect(pityText(0, '레어')).toBe('다음 1회 레어 확정!');
  });
});
