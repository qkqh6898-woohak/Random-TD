/**
 * M5-5 도박: 4테이블(10·100·1000·10000원, 1000원 계정 Lv7·10000원 Lv20, debug 허용), 배율표, 잭팟 게이지 10칸,
 * 도박꾼 ×0 감소, 10만 회 기대값 91% ± 1% (잭팟 포함 실제 도박 — M5 검토 반영).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/sim/Rng';
import { STREAM_WORLD, streamGamble } from '../../src/sim/World';
import { buildMatchRules } from '../../src/sim/rules';
import { placeTower } from '../../src/sim/systems/Summon';
import { gamble, gambleCheck, gambleExpectationBp, gamblePayout, gambleRollExpectationBp, gambleWeights, rollGamble } from '../../src/sim/systems/Gamble';
import { arena, command, data, eventsOf, infinite } from '../helpers/match';

const rules = buildMatchRules(data);

describe('도박 데이터 (GDD 7.2)', () => {
  it('테이블: 10·100원 기본, 1000원 계정 Lv7, 10000원 계정 Lv20', () => {
    expect(rules.gambleTables).toEqual([
      { cost: 10, unlockLevel: 1 },
      { cost: 100, unlockLevel: 1 },
      { cost: 1000, unlockLevel: 7 },
      { cost: 10000, unlockLevel: 20 },
    ]);
  });

  it('배율표: ×0 40% · ×0.5 20% · ×1 21% · ×2 11% · ×3 6% · ×5 2% (bp) — 표만 81%, 잭팟 포함 실제 기대값 91%', () => {
    expect(rules.gambleOutcomes.map((o) => [o.mulBp, o.chanceBp])).toEqual([
      [0, 4000],
      [5000, 2000],
      [10000, 2100],
      [20000, 1100],
      [30000, 600],
      [50000, 200],
    ]);
    expect(gambleRollExpectationBp(rules)).toBe(8100);
    expect(gambleRollExpectationBp(rules, 0, true)).toBe(35000); // 잭팟 한 번 = ×3 · ×5를 6 : 2 → ×3.5
    // (25 × 0.81 + 3.5) ÷ 26 = 0.9134…
    expect(gambleExpectationBp(rules)).toBe(9134);
    expect(rules.jackpotGauge).toBe(10);
    expect(rules.jackpotMinMulBp).toBe(30000);
  });

  it('결과 범위: 10원 → 0~50원, 10000원 → 0~50,000원 (비용 × 배율 내림, ×0.5는 10원 → 5원)', () => {
    expect(gamblePayout(10, 0)).toBe(0);
    expect(gamblePayout(10, 5000)).toBe(5);
    expect(gamblePayout(10, 50000)).toBe(50);
    expect(gamblePayout(10000, 50000)).toBe(50000);
  });
});

describe('gamble 명령', () => {
  it('10원 테이블: 10원을 내고 비용 × 배율을 받는다, gamble 사건(도박 직전 보유금 포함), 도박 횟수 +1, 최근 결과', () => {
    const m = infinite(1);
    command(m, { type: 'gamble', t: 0 });
    const ev = eventsOf(m, 'gamble');
    expect(ev).toHaveLength(1);
    const e = ev[0]!;
    expect(e).toMatchObject({ player: 0, t: 0, cost: 10, before: 1000, jackpot: false });
    expect(m.state.gold).toBe(1000 - 10 + (e.win as number));
    expect(e.win).toBe(gamblePayout(10, e.mul as number));
    expect(m.state.gambles).toBe(1);
    expect(m.state.gamble[0]?.recent).toEqual([e.mul]);
  });

  it('해금: 계정 Lv1이면 1000·10000원 잠김, Lv7이면 1000원까지, Lv20이면 전부', () => {
    const lv1 = infinite(1);
    lv1.state.gold = 100_000;
    expect([0, 1, 2, 3].map((t) => gambleCheck(lv1.ctx, 0, t))).toEqual([null, null, 'locked', 'locked']);
    const lv7 = infinite(1, { accountLevels: [7] });
    lv7.state.gold = 100_000;
    expect([0, 1, 2, 3].map((t) => gambleCheck(lv7.ctx, 0, t))).toEqual([null, null, null, 'locked']);
    const lv20 = infinite(1, { accountLevels: [20] });
    lv20.state.gold = 100_000;
    expect([0, 1, 2, 3].map((t) => gambleCheck(lv20.ctx, 0, t))).toEqual([null, null, null, null]);
    command(lv1, { type: 'gamble', t: 3 });
    expect(eventsOf(lv1, 'gambleFail').map((e) => e.reason)).toEqual(['locked']);
    expect(lv1.state.gold).toBe(100_000);
  });

  it('debug 판은 잠긴 테이블도 쓸 수 있고, 쓰면 debugUsed 표시', () => {
    const m = infinite(1, { debug: true });
    m.state.gold = 100_000;
    expect(gambleCheck(m.ctx, 0, 3)).toBeNull();
    command(m, { type: 'gamble', t: 1 });
    expect(m.state.debugUsed).toBe(false);
    command(m, { type: 'gamble', t: 3 });
    expect(m.state.debugUsed).toBe(true);
  });

  it('실패: 돈 부족 · 없는 테이블 · 판 끝 — 돈·난수·게이지 그대로', () => {
    const m = infinite(1);
    m.state.gold = 9;
    const before = m.world.rng(streamGamble(0)).snapshot();
    command(m, { type: 'gamble', t: 0 });
    command(m, { type: 'gamble', t: 7 });
    expect(eventsOf(m, 'gambleFail').map((e) => e.reason)).toEqual(['gold', 'unknown']);
    expect(m.state.gold).toBe(9);
    expect(m.world.rng(streamGamble(0)).snapshot()).toEqual(before);
    m.state.phase = 'defeat';
    expect(gambleCheck(m.ctx, 0, 0)).toBe('phase');
  });

  it('난수는 플레이어 도박 흐름에서만 도박마다 한 번 뽑기 (세계 흐름은 그대로 → 도박이 몹 등장을 바꾸지 않는다)', () => {
    const m = infinite(1);
    const world = m.world.rng(STREAM_WORLD).snapshot();
    const ref = Rng.restore(m.world.rng(streamGamble(0)).snapshot());
    for (let i = 0; i < 5; i++) m.world.enqueue({ type: 'gamble', t: 0 });
    m.step();
    for (let i = 0; i < 5; i++) ref.weightedIndex(gambleWeights(rules, 0, false));
    expect(m.world.rng(streamGamble(0)).snapshot()).toEqual(ref.snapshot());
    expect(m.world.rng(STREAM_WORLD).snapshot()).toEqual(world);
  });

  it('당첨금은 카드 \'황금 손\'(+25%)을 받지 않는다 (도박 기대값이 오르지 않게), 번 돈에도 넣지 않는다', () => {
    const m = infinite(3);
    m.state.goldPctBp = 2500;
    m.state.gold = 100_000;
    for (let i = 0; i < 30; i++) {
      const before = m.state.gold;
      const win = gamble(m.ctx, m.world, 0, 1) as number;
      expect(m.state.gold).toBe(before - 100 + win);
      expect(win % 50).toBe(0); // 100 × (0, 0.5, 1, 2, 3, 5)
    }
    expect(m.state.goldEarned).toBe(0);
  });
});

describe('잭팟 게이지 (PROGRESSION 9.2)', () => {
  it('×0이 나올 때마다 +1 (최대 10), 10칸이 찬 다음 도박은 ×3 이상 확정 + 게이지 0', () => {
    const m = infinite(7);
    m.state.gold = 10_000_000;
    let jackpots = 0;
    for (let i = 0; i < 2000; i++) {
      const g = m.state.gamble[0]!;
      const prev = g.gauge;
      gamble(m.ctx, m.world, 0, 0);
      const ev = m.world.drainEvents().filter((e) => e.type === 'gamble')[0]!;
      if (prev >= 10) {
        jackpots++;
        expect(ev.jackpot).toBe(true);
        expect(ev.mul as number).toBeGreaterThanOrEqual(30000);
        expect(g.gauge).toBe(0);
      } else {
        expect(ev.jackpot).toBe(false);
        expect(g.gauge).toBe(ev.mul === 0 ? prev + 1 : prev);
      }
      expect(ev.gauge).toBe(g.gauge);
    }
    expect(jackpots).toBeGreaterThan(50); // 약 2000 / 26
  });

  it('잭팟 가중치: ×3·×5만 기본 확률 비율 6 : 2', () => {
    expect(gambleWeights(rules, 0, true)).toEqual([0, 0, 0, 0, 600, 200]);
  });

  it('실제 기대값 식: ×0이 없으면 잭팟도 없다 (표 기대값 그대로), 게이지가 0칸이어도 표 그대로', () => {
    expect(gambleExpectationBp(rules, 9000)).toBe(gambleRollExpectationBp(rules, 9000));
    expect(gambleExpectationBp({ ...rules, jackpotGauge: 0 })).toBe(8100);
  });

  it('최근 결과는 5개까지 (오래된 것부터 버림)', () => {
    const m = infinite(1);
    m.state.gold = 100_000;
    for (let i = 0; i < 8; i++) gamble(m.ctx, m.world, 0, 0);
    expect(m.state.gamble[0]?.recent).toHaveLength(5);
  });
});

describe('도박꾼 특색: ×0 확률 −3%p → 그만큼 ×1에', () => {
  it('판 위 도박꾼이 있으면 가중치 ×0 37%·×1 24%, 표 기대값 84% · 잭팟 포함 약 93.5% (두 개여도 한 번만)', () => {
    const m = arena(1);
    placeTower(m.world, 'gambler', 0, 4, 0);
    placeTower(m.world, 'gambler', 0, 5, 0);
    expect(gambleWeights(rules, 300, false)).toEqual([3700, 2000, 2400, 1100, 600, 200]);
    expect(gambleRollExpectationBp(rules, 300)).toBe(8400);
    expect(gambleExpectationBp(rules, 300)).toBe(9349);
    // 실제 도박이 읽는 값
    m.state.gold = 100_000;
    const ev: number[] = [];
    for (let i = 0; i < 20_000; i++) {
      gamble(m.ctx, m.world, 0, 0);
    }
    for (const e of m.world.drainEvents()) if (e.type === 'gamble' && !e.jackpot) ev.push(e.mul as number);
    const zeroRate = ev.filter((x) => x === 0).length / ev.length;
    expect(zeroRate).toBeGreaterThan(0.35);
    expect(zeroRate).toBeLessThan(0.39);
  });

  it('×0 감소가 ×0 확률보다 크면 0까지만', () => {
    expect(gambleWeights(rules, 9000, false)).toEqual([0, 2000, 6100, 1100, 600, 200]);
  });
});

describe('10만 회 기대값 (DEV_PLAN M5-5)', () => {
  it('배율표 그대로 10만 번 뽑으면 (잭팟 없이) 표 기대값 81% ± 1%, 배율마다 확률 ± 0.5%p', () => {
    const rng = new Rng(20261115);
    const N = 100_000;
    const counts = new Map<number, number>();
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const o = rollGamble(rng, rules, 0, false);
      sum += o.mulBp;
      counts.set(o.mulBp, (counts.get(o.mulBp) ?? 0) + 1);
    }
    const ev = sum / N / 10000;
    expect(ev).toBeGreaterThan(0.8);
    expect(ev).toBeLessThan(0.82);
    for (const o of rules.gambleOutcomes) {
      const rate = (counts.get(o.mulBp) ?? 0) / N;
      expect(Math.abs(rate - o.chanceBp / 10000)).toBeLessThan(0.005);
    }
  });

  it('실제 100원 도박 10만 번 (잭팟 포함): 받은 돈 ÷ 낸 돈 = 91% ± 1% (DEV_PLAN M5-5 완료 조건, M5 검토 반영)', () => {
    const m = infinite(11);
    m.state.gold = 1e12;
    const N = 100_000;
    let paid = 0;
    let won = 0;
    let jackpots = 0;
    for (let i = 0; i < N; i++) {
      if (m.state.gamble[0]!.gauge >= rules.jackpotGauge) jackpots++;
      const win = gamble(m.ctx, m.world, 0, 1) as number;
      paid += 100;
      won += win;
      if (i % 5000 === 0) m.world.drainEvents();
    }
    // 잭팟 주기 ≈ 10 ÷ 0.4 + 1 = 26회
    expect(jackpots / N).toBeGreaterThan(1 / 28);
    expect(jackpots / N).toBeLessThan(1 / 24);
    expect(won / paid).toBeGreaterThan(0.9);
    expect(won / paid).toBeLessThan(0.92);
    expect(Math.abs(won / paid - gambleExpectationBp(rules) / 10000)).toBeLessThan(0.01);
  });

  it('판 위 도박꾼이 있으면 실제 10만 회 기대값 약 93.5% (잭팟 포함, 100% 아래)', () => {
    const m = arena(5);
    placeTower(m.world, 'gambler', 0, 4, 0);
    m.state.gold = 1e12;
    const N = 100_000;
    let won = 0;
    for (let i = 0; i < N; i++) {
      won += gamble(m.ctx, m.world, 0, 1) as number;
      if (i % 5000 === 0) m.world.drainEvents();
    }
    const ev = won / (N * 100);
    expect(Math.abs(ev - 0.9349)).toBeLessThan(0.01);
    expect(ev).toBeLessThan(1);
  });
});
