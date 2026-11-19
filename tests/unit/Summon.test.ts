/**
 * M2-1 소환: 빈 배치 칸 + 100원 → 덱 노말 5종 균등 (플레이어별 소환 난수), 신 판정 우선, 실패 이유, 실행 틱 재검사.
 */
import { describe, expect, it } from 'vitest';
import { validatePayload } from '../../src/sim/Commands';
import { Rng } from '../../src/sim/Rng';
import { streamSummon } from '../../src/sim/World';
import { listTowers, towerAt } from '../../src/sim/entities/Tower';
import { createMatch } from '../../src/sim/match';
import { buildMatchRules, type Deck, type MatchRules } from '../../src/sim/rules';
import { placeTower, rollSummon, summonCheck, towerCount } from '../../src/sim/systems/Summon';
import { command, data, infinite, summonAt } from '../helpers/match';

const rules: MatchRules = buildMatchRules(data);
const BASE_NORMALS = ['miner', 'goblin', 'archer', 'apprentice', 'warrior'];

describe('데이터: 소환 규칙과 기본 덱', () => {
  it('소환 비용 100원, 신 확률 0.01% = 1bp, 신 3종, 기본 덱 노말 = 광부·고블린·궁수·견습 마법사·전사', () => {
    expect(rules.summonCost).toBe(100);
    expect(rules.godChanceBp).toBe(1);
    expect(rules.godTowers).toHaveLength(3);
    for (const id of rules.godTowers) expect(rules.towers.get(id)?.grade).toBe('god');
    expect([...rules.baseDeck.normal]).toEqual(BASE_NORMALS);
    for (const g of ['normal', 'rare', 'unique', 'hero', 'legend'] as const) expect(rules.baseDeck[g]).toHaveLength(5);
  });

  it('towers.json 수치 → 정수: 견습 마법사 마법 9.75 → 975, 공속 0.8 → 800, 사거리 2.5칸 → 2500 / 근접은 즉시, 원거리는 투사체', () => {
    const app = rules.towers.get('apprentice')!;
    expect(app.matkC).toBe(975);
    expect(app.apsMilli).toBe(800);
    expect(app.range).toBe(2500);
    expect(app.instant).toBe(false);
    expect(rules.towers.get('goblin')!.instant).toBe(true); // melee
    expect(rules.towers.get('warrior')!.atkC).toBe(2700);
    expect(rules.towers.get('archer')!.instant).toBe(false); // single
    expect(rules.towers.get('cleaver')!.instant).toBe(true); // melee_aoe
  });

  it('투사체 속도: 초속 12칸 = 600단위/틱', () => {
    expect(rules.projectileSpeed).toBe(600);
  });
});

describe('소환 판정 (rollSummon)', () => {
  it('1만 회 소환 → 덱 노말 5종이 각각 20% ±1.5%', () => {
    const rng = new Rng(20261114);
    const counts: Record<string, number> = {};
    let gods = 0;
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const r = rollSummon(rng, rules, rules.baseDeck);
      if (r.god) gods++;
      else counts[r.tower] = (counts[r.tower] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual([...BASE_NORMALS].sort());
    for (const id of BASE_NORMALS) {
      const share = (counts[id] ?? 0) / N;
      expect(share).toBeGreaterThanOrEqual(0.185);
      expect(share).toBeLessThanOrEqual(0.215);
    }
    expect(gods).toBeLessThan(10); // 0.01% → 1만 회에 평균 1번
  });

  it('신 판정이 먼저: 확률 100%면 언제나 신 3종 중 하나, 0%면 절대 안 나온다', () => {
    const always = { ...rules, godChanceBp: 10_000 } as MatchRules;
    const never = { ...rules, godChanceBp: 0 } as MatchRules;
    const rng = new Rng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const r = rollSummon(rng, always, rules.baseDeck);
      expect(r.god).toBe(true);
      seen.add(r.tower);
    }
    expect([...seen].sort()).toEqual([...rules.godTowers].sort()); // 3종 모두 나온다
    for (let i = 0; i < 300; i++) expect(rollSummon(rng, never, rules.baseDeck).god).toBe(false);
  });

  it('신 판정은 확률과 상관없이 난수 1개를 쓴다 → 확률 0과 0.01%의 일반 결과 수열이 같다', () => {
    const never = { ...rules, godChanceBp: 0 } as MatchRules;
    const a = new Rng(77);
    const b = new Rng(77);
    for (let i = 0; i < 500; i++) {
      const ra = rollSummon(a, rules, rules.baseDeck);
      const rb = rollSummon(b, never, rules.baseDeck);
      if (!ra.god) expect(ra.tower).toBe(rb.tower);
      else break;
    }
  });

  it('덱 노말 5종 중에서만 고른다 (다른 덱)', () => {
    const deck: Deck = { ...rules.baseDeck, normal: ['drummer', 'spearman', 'stonegolem', 'ninja', 'k9'] };
    const rng = new Rng(3);
    const never = { ...rules, godChanceBp: 0 } as MatchRules;
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(rollSummon(rng, never, deck).tower);
    expect([...seen].sort()).toEqual([...deck.normal].sort());
  });
});

describe('summon 명령', () => {
  it('빈 배치 칸 + 100원 → 그 칸에 타워 1개, 돈 1000 → 900, summon 사건', () => {
    const m = infinite(1);
    expect(m.state.gold).toBe(1000);
    const t = summonAt(m, 0, 0);
    expect(t).toBeDefined();
    expect(BASE_NORMALS).toContain(t!.tower);
    expect(t!.owner).toBe(0);
    expect([t!.x, t!.y]).toEqual([500, 500]); // 칸 중심
    expect(m.state.gold).toBe(900);
    expect(m.state.summons).toBe(1);
    const ev = m.world.drainEvents().find((e) => e.type === 'summon');
    expect(ev).toMatchObject({ id: t!.id, tower: t!.tower, grade: 'normal', god: false, x: 0, y: 0 });
  });

  it('10번 소환하면 돈 0, 11번째는 돈 부족 (gold) — 상태·난수 그대로', () => {
    const m = infinite(2);
    const tiles = m.map.buildable.slice(0, 11);
    for (const [x, y] of tiles.slice(0, 10)) expect(summonAt(m, x, y)).toBeDefined();
    expect(m.state.gold).toBe(0);
    m.world.drainEvents();
    const before = m.world.rng(streamSummon(0)).snapshot();
    const [x, y] = tiles[10]!;
    expect(summonAt(m, x, y)).toBeUndefined();
    expect(m.world.drainEvents().find((e) => e.type === 'summonFail')).toMatchObject({ reason: 'gold', x, y, player: 0 });
    expect(m.world.rng(streamSummon(0)).snapshot()).toEqual(before);
    expect(towerCount(m.world)).toBe(10);
    expect(m.state.summons).toBe(10);
  });

  it('경로 칸·맵 밖 → notBuildable, 이미 타워가 있는 칸 → occupied (돈 그대로)', () => {
    const m = infinite(3);
    expect(summonCheck(m.ctx, m.world, 1, 1)).toBe('notBuildable'); // 순환의 정원 경로
    expect(summonCheck(m.ctx, m.world, 9, 0)).toBe('notBuildable'); // 맵 밖
    command(m, { type: 'summon', x: 1, y: 1 });
    expect(m.state.gold).toBe(1000);
    summonAt(m, 4, 4);
    command(m, { type: 'summon', x: 4, y: 4 });
    expect(m.state.gold).toBe(900);
    expect(towerCount(m.world)).toBe(1);
    const fails = m.world.drainEvents().filter((e) => e.type === 'summonFail').map((e) => e.reason);
    expect(fails).toEqual(['notBuildable', 'occupied']);
  });

  it('배치 칸이 가득 차면 → full (순환의 정원 71칸)', () => {
    const m = infinite(4);
    expect(m.map.buildable).toHaveLength(71);
    for (const [x, y] of m.map.buildable) placeTower(m.world, 'archer', 0, x, y);
    expect(summonCheck(m.ctx, m.world, 0, 0)).toBe('full');
    // 하나 비면 다시 occupied / 빈 칸은 소환 가능
    m.world.entities.remove(towerAt(m.world, 8, 10)!.id);
    expect(summonCheck(m.ctx, m.world, 0, 0)).toBe('occupied');
    expect(summonCheck(m.ctx, m.world, 8, 10)).toBeNull();
  });

  it('같은 틱에 같은 칸 명령 2개 → 앞의 것만 되고 뒤의 것은 occupied (실행 틱에 다시 검사)', () => {
    const m = infinite(5);
    m.world.enqueue({ type: 'summon', x: 2, y: 2 });
    m.world.enqueue({ type: 'summon', x: 2, y: 2 });
    m.step();
    expect(listTowers(m.world)).toHaveLength(1);
    expect(m.state.gold).toBe(900);
    expect(m.world.drainEvents().filter((e) => e.type === 'summonFail').map((e) => e.reason)).toEqual(['occupied']);
  });

  it('패배한 판에서는 소환 안 됨 (phase)', () => {
    const m = infinite(6);
    m.state.phase = 'defeat';
    expect(summonCheck(m.ctx, m.world, 0, 0)).toBe('phase');
  });

  it('플레이어별 소환 난수: P0이 몇 번 소환해도 P1의 결과 수열은 같다', () => {
    const run = (p0Summons: number): string[] => {
      const m = createMatch(data, { seed: 99, mode: 'infinite', players: 2, legacyCommands: true });
      m.state.gold = 100_000;
      const tiles = m.map.buildable;
      let k = 0;
      for (let i = 0; i < p0Summons; i++) {
        const [x, y] = tiles[k++]!;
        summonAt(m, x, y, 0);
      }
      const out: string[] = [];
      for (let i = 0; i < 10; i++) {
        const [x, y] = tiles[k++]!;
        out.push(summonAt(m, x, y, 1)!.tower);
      }
      return out;
    };
    const base = run(0);
    expect(run(7)).toEqual(base);
    expect(run(10)).toEqual(base); // 10 + 10 = 20칸 (순환의 정원 v3 배치 칸 전부, G-1)
    expect(new Set(base).size).toBeGreaterThan(1);
  });

  it('소환은 세계 난수(몹 등장 순서)를 쓰지 않는다', () => {
    const a = infinite(11);
    const b = infinite(11);
    for (const [x, y] of a.map.buildable.slice(0, 8)) summonAt(a, x, y);
    b.stepN(8);
    expect(a.world.rng('world').snapshot()).toEqual(b.world.rng('world').snapshot());
  });

  it('잘못된 덱으로는 판을 만들 수 없다', () => {
    const bad: Deck = { ...rules.baseDeck, normal: ['miner', 'goblin', 'archer', 'apprentice', 'merchant'] };
    expect(() => createMatch(data, { seed: 1, mode: 'infinite', decks: [bad] })).toThrow(/merchant는 rare/);
    const short: Deck = { ...rules.baseDeck, normal: ['miner'] };
    expect(() => createMatch(data, { seed: 1, mode: 'infinite', decks: [short] })).toThrow(/5종/);
  });

  it('명령 검사: 좌표는 0~255 정수, 모르는 필드 거절', () => {
    expect(validatePayload({ type: 'summon', x: 1, y: 2 })).toBeNull();
    expect(validatePayload({ type: 'summon', x: -1, y: 2 })).toMatch(/x/);
    expect(validatePayload({ type: 'summon', x: 1.5, y: 2 })).toMatch(/x/);
    expect(validatePayload({ type: 'summon', x: 1, y: 256 })).toMatch(/y/);
    expect(validatePayload({ type: 'summon', x: 1 })).toMatch(/y/);
    expect(validatePayload({ type: 'summon', x: 1, y: 1, tower: 'god' })).toMatch(/모르는 필드/);
    expect(validatePayload({ type: 'debugAddGold', amount: 0 })).toMatch(/amount/);
  });

  it('개발용 돈 추가: debug 판에서만 듣고 debugUsed 표시', () => {
    const normal = infinite(1);
    command(normal, { type: 'debugAddGold', amount: 5000 });
    expect(normal.state.gold).toBe(1000);
    const dbg = infinite(1, { debug: true });
    command(dbg, { type: 'debugAddGold', amount: 5000 });
    expect(dbg.state.gold).toBe(6000);
    expect(dbg.state.debugUsed).toBe(true);
  });

  it('개발용 타워 놓기 (debugTower, M3b): debug 판의 빈 배치 칸에만, towers.json 순서 번호로, 돈 없이', () => {
    expect(validatePayload({ type: 'debugTower', x: 1, y: 2, t: 3 })).toBeNull();
    expect(validatePayload({ type: 'debugTower', x: 1, y: 2, t: -1 })).toMatch(/t/);
    const idx = rules.towerOrder.indexOf('icemage');
    const normal = infinite(1);
    command(normal, { type: 'debugTower', x: 4, y: 4, t: idx });
    expect(normal.towers()).toHaveLength(0);
    const dbg = infinite(1, { debug: true });
    command(dbg, { type: 'debugTower', x: 4, y: 4, t: idx });
    expect(dbg.towers().map((t) => t.tower)).toEqual(['icemage']);
    expect(dbg.state.gold).toBe(1000);
    expect(dbg.state.debugUsed).toBe(true);
    // 이미 찬 칸·경로 칸·없는 번호는 무시
    command(dbg, { type: 'debugTower', x: 4, y: 4, t: 0 });
    command(dbg, { type: 'debugTower', x: 1, y: 1, t: 0 });
    command(dbg, { type: 'debugTower', x: 4, y: 5, t: 200 });
    expect(dbg.towers()).toHaveLength(1);
  });
});
