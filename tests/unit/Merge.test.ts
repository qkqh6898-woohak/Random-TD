/**
 * M3-3 덱 모델 · M3-1 승급 · M3-2 모두 승급 (GDD 4.2·4.4, DEV_PLAN 3.1 '승급' 시나리오):
 * 3개 미만 불가 · 다른 등급 같은 이름 불가 · 결과 위치 · 사라지는 2개 선택 · 레전드 불가 · 신 0.01% 판정 · 모두 승급 7개 → 2회.
 */
import { describe, expect, it } from 'vitest';
import { validatePayload } from '../../src/sim/Commands';
import { DECK_GRADES, canMergeGrade, mergeOutcomes, nextGrade, rollMerge } from '../../src/sim/Deck';
import { Rng } from '../../src/sim/Rng';
import { streamSummon } from '../../src/sim/World';
import { listTowers, towerAt, type Tower } from '../../src/sim/entities/Tower';
import { buildMatchRules, type Deck, type MatchRules } from '../../src/sim/rules';
import { merge, mergeAll, mergeAllCount, mergeCheck, pickConsumed, sameKindTowers } from '../../src/sim/systems/Merge';
import { placeTower } from '../../src/sim/systems/Summon';
import { command, data, infinite } from '../helpers/match';

const rules: MatchRules = buildMatchRules(data);

/** 순환의 정원 배치 칸 몇 개 (y, x 순으로 앞에서부터). */
function cells(m: ReturnType<typeof infinite>, n: number): [number, number][] {
  return m.map.buildable.slice(0, n).map(([x, y]) => [x, y] as [number, number]);
}

/** 이 판의 규칙 일부를 바꾼다 (규칙 객체는 얼려 있으므로 복사본으로 바꿔 끼운다. 시스템은 ctx.rules를 그때그때 읽는다). */
function patchRules(m: ReturnType<typeof infinite>, patch: Partial<MatchRules>): void {
  (m.ctx as { rules: MatchRules }).rules = { ...m.ctx.rules, ...patch };
}

/** 같은 타워를 여러 칸에 놓는다 (놓은 순서 = ID 순). */
function placeAll(m: ReturnType<typeof infinite>, towerId: string, at: [number, number][], owner = 0): Tower[] {
  return at.map(([x, y]) => placeTower(m.world, towerId, owner, x, y));
}

describe('덱 모델 (M3-3)', () => {
  it('기본 덱 = towers.json에서 처음부터 해금된(unlock = base) 25종, 등급별 5종', () => {
    const base = data.towers.towers.filter((t) => t.unlock === 'base').map((t) => t.id).sort();
    expect(base).toHaveLength(25);
    const deck = DECK_GRADES.flatMap((g) => rules.baseDeck[g]);
    expect([...deck].sort()).toEqual(base);
    for (const g of DECK_GRADES) {
      expect(rules.baseDeck[g]).toHaveLength(5);
      for (const id of rules.baseDeck[g]) expect(rules.towers.get(id)?.grade).toBe(g);
    }
  });

  it('다음 등급: 노말 → 레어 → 유니크 → 히어로 → 레전드, 레전드·신·히든은 승급 불가', () => {
    expect(nextGrade('normal')).toBe('rare');
    expect(nextGrade('rare')).toBe('unique');
    expect(nextGrade('unique')).toBe('hero');
    expect(nextGrade('hero')).toBe('legend');
    expect(nextGrade('legend')).toBeNull();
    expect(nextGrade('god')).toBeNull();
    expect(nextGrade('hidden')).toBeNull();
    expect(canMergeGrade('hero')).toBe(true);
    expect(canMergeGrade('legend')).toBe(false);
    expect(mergeOutcomes(rules.baseDeck, 'normal')).toEqual(rules.baseDeck.rare);
    expect(mergeOutcomes(rules.baseDeck, 'legend')).toEqual([]);
  });

  it('승급 결과는 덱의 다음 등급 5종 균등 (1만 회 각 20% ±1.5%), 신 판정은 매번 난수 1개', () => {
    const rng = new Rng(777);
    const counts: Record<string, number> = {};
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const r = rollMerge(rng, rules, rules.baseDeck, 'unique');
      if (!r.god) counts[r.tower] = (counts[r.tower] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual([...rules.baseDeck.hero].sort());
    for (const id of rules.baseDeck.hero) {
      expect((counts[id] ?? 0) / N).toBeGreaterThan(0.185);
      expect((counts[id] ?? 0) / N).toBeLessThan(0.215);
    }
    // 난수 사용: 신 판정 1개 + 고르기 1개 = 2개 (확률이 0이어도 같다)
    const a = new Rng(5);
    const b = new Rng(5);
    rollMerge(a, { ...rules, godChanceBp: 0 }, rules.baseDeck, 'normal');
    b.nextU32();
    b.nextU32();
    expect(a.nextU32()).toBe(b.nextU32());
  });

  it('신 0.01% 판정: 확률 100%로 바꾸면 덱과 무관하게 신 3종 중 하나', () => {
    const always = { ...rules, godChanceBp: 10_000 };
    const r = rollMerge(new Rng(1), always, rules.baseDeck, 'normal');
    expect(r.god).toBe(true);
    expect(rules.godTowers).toContain(r.tower);
    // 1bp = 0.01%: 100만 번에 약 100번
    const rng = new Rng(99);
    let gods = 0;
    for (let i = 0; i < 1_000_000; i++) if (rng.chanceBp(rules.godChanceBp)) gods++;
    expect(gods).toBeGreaterThan(60);
    expect(gods).toBeLessThan(140);
  });

  it('레전드는 승급할 수 없다 (rollMerge 에러)', () => {
    expect(() => rollMerge(new Rng(1), rules, rules.baseDeck, 'legend')).toThrow(/승급할 수 없는/);
  });

  it('덱이 다르면 결과도 그 덱의 다음 등급에서', () => {
    const deck: Deck = { ...rules.baseDeck, rare: ['gunner', 'dwarfbomber', 'windarcher', 'scout', 'bard'] };
    const rng = new Rng(3);
    for (let i = 0; i < 200; i++) {
      const r = rollMerge(rng, rules, deck, 'normal');
      if (!r.god) expect(deck.rare).toContain(r.tower);
    }
  });
});

describe('승급 (M3-1)', () => {
  it('같은 종류 3개 → 터치한 칸에 덱의 다음 등급 하나, 사라지는 2개 = 가장 나중에 소환된 2개', () => {
    const m = infinite(11);
    const at = cells(m, 5);
    const [t1, t2, t3, t4] = placeAll(m, 'archer', at.slice(0, 4)); // 궁수 4개 (ID 순 = 소환 순)
    const other = placeTower(m.world, 'goblin', 0, at[4]![0], at[4]![1]);
    // 가장 먼저 놓은 t1을 터치 → t4, t3이 사라지고 t2는 남는다
    command(m, { type: 'merge', x: t1!.tx, y: t1!.ty });
    const result = towerAt(m.world, t1!.tx, t1!.ty)!;
    expect(result.id).not.toBe(t1!.id);
    expect(rules.baseDeck.rare).toContain(result.tower);
    expect(towerAt(m.world, t2!.tx, t2!.ty)?.id).toBe(t2!.id);
    expect(towerAt(m.world, t3!.tx, t3!.ty)).toBeUndefined();
    expect(towerAt(m.world, t4!.tx, t4!.ty)).toBeUndefined();
    expect(towerAt(m.world, other.tx, other.ty)?.id).toBe(other.id);
    expect(listTowers(m.world)).toHaveLength(3);
    expect(m.state.merges).toBe(1);
    const ev = m.world.drainEvents().find((e) => e.type === 'merge')!;
    expect(ev).toMatchObject({ player: 0, id: result.id, from: t1!.id, fromTower: 'archer', tower: result.tower, grade: 'rare', x: t1!.tx, y: t1!.ty });
    expect(String(ev.removed).split(';').sort()).toEqual([`${t3!.tx},${t3!.ty}`, `${t4!.tx},${t4!.ty}`].sort());
  });

  it('터치한 타워가 가장 나중에 소환된 타워면 그다음 2개가 사라진다 (터치한 타워는 결과로 바뀜)', () => {
    const m = infinite(12);
    const ts = placeAll(m, 'miner', cells(m, 4));
    const touched = ts[3]!;
    expect(pickConsumed(ts, touched, 2).map((t) => t.id)).toEqual([ts[2]!.id, ts[1]!.id]);
    command(m, { type: 'merge', x: touched.tx, y: touched.ty });
    expect(towerAt(m.world, ts[0]!.tx, ts[0]!.ty)?.id).toBe(ts[0]!.id);
    expect(towerAt(m.world, ts[1]!.tx, ts[1]!.ty)).toBeUndefined();
    expect(towerAt(m.world, ts[2]!.tx, ts[2]!.ty)).toBeUndefined();
    expect(rules.towers.get(towerAt(m.world, touched.tx, touched.ty)!.tower)?.grade).toBe('rare');
  });

  it('3개 미만이면 승급 불가 (상태·난수 그대로, mergeFail count)', () => {
    const m = infinite(13);
    const ts = placeAll(m, 'warrior', cells(m, 2));
    const before = m.world.rng(streamSummon(0)).snapshot();
    command(m, { type: 'merge', x: ts[0]!.tx, y: ts[0]!.ty });
    expect(listTowers(m.world).map((t) => t.id)).toEqual(ts.map((t) => t.id));
    expect(m.world.rng(streamSummon(0)).snapshot()).toEqual(before);
    expect(m.state.merges).toBe(0);
    expect(m.world.drainEvents().find((e) => e.type === 'mergeFail')).toMatchObject({ reason: 'count' });
  });

  it('같은 등급이어도 다른 종류는 세지 않는다 (궁수 2 + 고블린 1 → 불가)', () => {
    const m = infinite(14);
    const at = cells(m, 3);
    placeAll(m, 'archer', at.slice(0, 2));
    placeTower(m.world, 'goblin', 0, at[2]![0], at[2]![1]);
    expect(mergeCheck(m.ctx, m.world, 0, at[0]![0], at[0]![1])).toEqual({ ok: false, reason: 'count' });
  });

  it('레전드 3개는 승급 불가 (maxGrade), 신·히든도 불가', () => {
    const m = infinite(15);
    const at = cells(m, 6);
    placeAll(m, 'warlord', at.slice(0, 3));
    expect(mergeCheck(m.ctx, m.world, 0, at[0]![0], at[0]![1])).toEqual({ ok: false, reason: 'maxGrade' });
    placeAll(m, 'fate', at.slice(3, 6));
    expect(mergeCheck(m.ctx, m.world, 0, at[3]![0], at[3]![1])).toEqual({ ok: false, reason: 'maxGrade' });
    command(m, { type: 'merge', x: at[0]![0], y: at[0]![1] });
    expect(listTowers(m.world)).toHaveLength(6);
  });

  it('빈 칸·남의 타워는 승급 불가, 2인 판에서 남의 같은 타워는 세지 않는다', () => {
    const m = infinite(16, { players: 2 });
    const at = cells(m, 4);
    expect(mergeCheck(m.ctx, m.world, 0, at[0]![0], at[0]![1])).toEqual({ ok: false, reason: 'noTower' });
    placeAll(m, 'archer', at.slice(0, 2), 0);
    placeAll(m, 'archer', at.slice(2, 4), 1);
    expect(mergeCheck(m.ctx, m.world, 0, at[0]![0], at[0]![1])).toEqual({ ok: false, reason: 'count' });
    expect(mergeCheck(m.ctx, m.world, 1, at[0]![0], at[0]![1])).toEqual({ ok: false, reason: 'notOwner' });
    expect(sameKindTowers(m.world, 'archer', 1)).toHaveLength(2);
  });

  it('승급 결과는 새 타워: 공격 타이머 준비 상태·피해 나머지 0·공격 수 0 (판 내 스택 초기화)', () => {
    const m = infinite(17);
    const ts = placeAll(m, 'goblin', cells(m, 3));
    for (const t of ts) {
      t.attacks = 50;
      t.remDmg = 77;
    }
    command(m, { type: 'merge', x: ts[0]!.tx, y: ts[0]!.ty });
    const r = towerAt(m.world, ts[0]!.tx, ts[0]!.ty)!;
    expect(r).toMatchObject({ attacks: 0, remDmg: 0, owner: 0 });
    expect(r.bornTick).toBe(m.tick - 1);
  });

  it('승급마다 신 판정: 확률을 100%로 두면 결과가 신 타워, merge 사건 god = true', () => {
    const m = infinite(18);
    patchRules(m, { godChanceBp: 10_000 });
    const ts = placeAll(m, 'archer', cells(m, 3));
    command(m, { type: 'merge', x: ts[0]!.tx, y: ts[0]!.ty });
    const r = towerAt(m.world, ts[0]!.tx, ts[0]!.ty)!;
    expect(rules.godTowers).toContain(r.tower);
    expect(m.world.drainEvents().find((e) => e.type === 'merge')).toMatchObject({ god: true, grade: 'god' });
  });

  it('같은 시드·같은 명령이면 같은 결과 (플레이어별 소환·승급 흐름)', () => {
    const run = (): string[] => {
      const m = infinite(42);
      const ts = placeAll(m, 'archer', cells(m, 9));
      for (let i = 0; i < 3; i++) command(m, { type: 'merge', x: ts[i]!.tx, y: ts[i]!.ty });
      return listTowers(m.world).map((t) => `${t.tower}@${t.tx},${t.ty}`);
    };
    expect(run()).toEqual(run());
  });

  it('명령 검사: 칸 좌표는 0~255 정수', () => {
    expect(validatePayload({ type: 'merge', x: 1, y: 2 })).toBeNull();
    expect(validatePayload({ type: 'mergeAll', x: 1, y: 2 })).toBeNull();
    expect(validatePayload({ type: 'merge', x: -1, y: 2 })).toMatch(/x/);
    expect(validatePayload({ type: 'mergeAll', x: 1, y: 256 })).toMatch(/y/);
    expect(validatePayload({ type: 'merge', x: 1, y: 2, tower: 'x' })).toMatch(/모르는 필드/);
  });
});

describe('모두 승급 (M3-2)', () => {
  it('7개 → 승급 2회, 같은 종류 1개 남음', () => {
    expect(mergeAllCount(7, 3)).toBe(2);
    expect(mergeAllCount(2, 3)).toBe(0);
    expect(mergeAllCount(9, 3)).toBe(3);
    const m = infinite(21);
    const ts = placeAll(m, 'apprentice', cells(m, 7));
    const touched = ts[3]!;
    command(m, { type: 'mergeAll', x: touched.tx, y: touched.ty });
    const merges = m.world.drainEvents().filter((e) => e.type === 'merge');
    expect(merges).toHaveLength(2);
    expect(m.state.merges).toBe(2);
    expect(sameKindTowers(m.world, 'apprentice', 0)).toHaveLength(1);
    const rares = listTowers(m.world).filter((t) => rules.towers.get(t.tower)?.grade === 'rare');
    expect(rares).toHaveLength(2);
    // 첫 결과 = 터치한 칸, 사라진 2개 = 가장 나중의 t7·t6
    expect(merges[0]).toMatchObject({ x: touched.tx, y: touched.ty, from: touched.id });
    // 둘째 결과 = 남은 t1·t2·t3·t5 중 가장 먼저 소환된 t1 자리, 사라진 2개 = t5·t3 → t2가 남는다
    expect(merges[1]).toMatchObject({ x: ts[0]!.tx, y: ts[0]!.ty, from: ts[0]!.id });
    expect(sameKindTowers(m.world, 'apprentice', 0)[0]!.id).toBe(ts[1]!.id);
  });

  it('결과가 또 3개가 되어도 이어서 승급하지 않는다 (터치한 종류만)', () => {
    // 덱 레어 자리를 판을 만든 뒤 모두 상인으로 바꿔 결과가 같은 레어 3개가 되게 한다 (신 판정은 0%)
    const deck = { ...rules.baseDeck, rare: [...rules.baseDeck.rare] };
    const m = infinite(22, { decks: [deck] });
    deck.rare.fill('merchant');
    patchRules(m, { godChanceBp: 0 });
    const ts = placeAll(m, 'archer', cells(m, 9));
    command(m, { type: 'mergeAll', x: ts[0]!.tx, y: ts[0]!.ty });
    expect(m.state.merges).toBe(3);
    expect(listTowers(m.world).map((t) => t.tower)).toEqual(['merchant', 'merchant', 'merchant']);
  });

  it('3개 미만이면 아무 일 없음 (mergeFail)', () => {
    const m = infinite(23);
    const ts = placeAll(m, 'archer', cells(m, 2));
    command(m, { type: 'mergeAll', x: ts[0]!.tx, y: ts[0]!.ty });
    expect(listTowers(m.world)).toHaveLength(2);
    expect(m.world.drainEvents().some((e) => e.type === 'mergeFail')).toBe(true);
  });

  it('mergeAll을 직접 부르면 결과 타워 목록 (3개 → 1개)', () => {
    const m = infinite(24);
    const ts = placeAll(m, 'warrior', cells(m, 3));
    expect(mergeAll(m.ctx, m.world, 0, ts[1]!.tx, ts[1]!.ty)).toHaveLength(1);
    expect(merge(m.ctx, m.world, 0, ts[1]!.tx, ts[1]!.ty)).toBeNull(); // 결과(레어) 하나뿐
  });
});
