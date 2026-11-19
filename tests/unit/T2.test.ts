/**
 * T-2 sim: 타워 판매(sellTower)·개발자 변환(debugConvertTower)·개발자 확률 조정(debugSetChance)·자동 소환 칸·테이블 동시 도박과 미션.
 * 명령 검사·결정성·리플레이 왕복까지.
 */
import { describe, expect, it } from 'vitest';
import { buildMatchRules } from '../../src/sim/rules';
import { validatePayload } from '../../src/sim/Commands';
import { towerAt } from '../../src/sim/entities/Tower';
import type { SimMap } from '../../src/sim/map';
import { autoSummonTile, pathTilesAround, placeTower } from '../../src/sim/systems/Summon';
import { convertTargets, sellPrice } from '../../src/sim/systems/Sell';
import { chanceMaxBp, chanceValue, effectiveGambleOutcomes } from '../../src/sim/chances';
import { gambleExpectationBp, gambleRulesOf, gambleWeights } from '../../src/sim/systems/Gamble';
import { effectiveStats } from '../../src/sim/stats';
import { computeAuras, towerBonus } from '../../src/sim/systems/Aura';
import { playReplay, recordReplay, replayToJson } from '../../src/sim/replay';
import { MISSION_OPEN } from '../../src/sim/state';
import type { Match } from '../../src/sim/match';
import { arena, arenaData, command, data, eventsOf, infinite } from '../helpers/match';

const rules = buildMatchRules(data);
const idsOf = (grade: string): string[] => data.towers.towers.filter((t) => t.grade === grade).map((t) => t.id);
const indexOf = (id: string): number => rules.towerOrder.indexOf(id);

/** 첫 빈 배치 칸에 타워를 바로 놓는다. */
function put(m: Match, id: string, owner = 0): { x: number; y: number } {
  for (const [x, y] of m.map.buildable) {
    if (!towerAt(m.world, x, y)) {
      placeTower(m.world, id, owner, x, y);
      return { x, y };
    }
  }
  throw new Error('빈 칸 없음');
}

describe('판매가 (game.json sell)', () => {
  it('가치 = 노말 가치(sell.baseValue 30, V2.0 PR-A 소환 비용과 따로) × 3^등급 (노말 30 · 레어 90 · 유니크 270 · 히어로 810 · 레전드 2,430), 판매가 = 50% 내림', () => {
    const expected: Record<string, number> = { normal: 15, rare: 45, unique: 135, hero: 405, legend: 1215, god: 1215 };
    for (const [grade, price] of Object.entries(expected)) {
      for (const id of idsOf(grade)) expect(sellPrice(rules, id), `${grade} ${id}`).toBe(price);
    }
    expect(rules.towerValues.get(idsOf('legend')[0]!)).toBe(2430);
    expect(rules.towerValues.get(idsOf('god')[0]!)).toBe(2430); // 신 = 레전드 가치
  });

  it('히든 = 조합 재료 가치의 합 × 50% (12종 모두 재료가 있다)', () => {
    const hidden = data.towers.towers.filter((t) => t.grade === 'hidden');
    expect(hidden).toHaveLength(12);
    for (const t of hidden) {
      const sum = (t.recipe ?? []).reduce((s, id) => s + (rules.towerValues.get(id) ?? 0), 0);
      expect(sum).toBeGreaterThan(0);
      expect(sellPrice(rules, t.id)).toBe(Math.floor((sum * 5000) / 10000));
    }
    // 원소 정령 = 화염 마법사(레어) + 얼음 마법사(유니크) + 대마법사(레전드)
    const el = hidden.find((t) => t.id === 'elemental');
    if (el) {
      const v = (el.recipe ?? []).map((id) => rules.towerValues.get(id) ?? 0);
      expect(rules.towerValues.get('elemental')).toBe(v.reduce((a, b) => a + b, 0));
    }
  });
});

describe('sellTower 명령', () => {
  it('타워를 지우고 칸을 비우며 판매가를 받는다 (번 돈·황금 손 아님), sell 사건, 판 수', () => {
    const m = arena();
    const at = put(m, idsOf('rare')[0]!);
    m.state.summonCount[0] = 40; // 지금 소환 비용 102원 → 레어 표 판매가 45원 그대로 (V2.0 PR-A 상한 = ⌊(소환 비용 − 1) ÷ 2⌋ = 50)
    const gold = m.state.gold;
    const earned = m.state.goldEarned;
    m.state.goldPctBp = 2500; // 황금 손이 있어도 판매가는 그대로
    command(m, { type: 'sellTower', x: at.x, y: at.y });
    expect(towerAt(m.world, at.x, at.y)).toBeUndefined();
    expect(m.state.gold).toBe(gold + 45);
    expect(m.state.goldEarned).toBe(earned);
    expect(m.state.sells).toBe(1);
    const ev = eventsOf(m, 'sell');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ player: 0, x: at.x, y: at.y, gold: 45, grade: 'rare' });
    // 빈 칸이 되었으니 다시 소환할 수 있다
    command(m, { type: 'summon', x: at.x, y: at.y });
    expect(towerAt(m.world, at.x, at.y)).toBeDefined();
  });

  it('검사: 빈 칸·남의 타워·판이 끝남 → sellFail, 상태 그대로', () => {
    const m = infinite(1, { players: 2 });
    const mine = put(m, idsOf('normal')[0]!, 0);
    const theirs = put(m, idsOf('normal')[1]!, 1);
    const gold = m.state.gold;
    const empty = m.map.buildable.find(([x, y]) => !towerAt(m.world, x, y))!;
    command(m, { type: 'sellTower', x: empty[0], y: empty[1] });
    command(m, { type: 'sellTower', x: theirs.x, y: theirs.y, player: 0 });
    expect(eventsOf(m, 'sellFail').map((e) => e.reason)).toEqual(['noTower', 'notOwner']);
    m.state.phase = 'defeat';
    command(m, { type: 'sellTower', x: mine.x, y: mine.y });
    expect(eventsOf(m, 'sellFail').map((e) => e.reason)).toEqual(['phase']);
    expect(m.state.gold).toBe(gold);
    expect(m.state.sells).toBeUndefined();
    expect(towerAt(m.world, mine.x, mine.y)).toBeDefined();
  });

  it('같은 틱에 같은 칸 판매 두 번 → 한 번만 (두 번째는 noTower)', () => {
    const m = arena();
    const at = put(m, idsOf('normal')[0]!);
    const gold = m.state.gold;
    m.world.enqueue({ type: 'sellTower', x: at.x, y: at.y });
    m.world.enqueue({ type: 'sellTower', x: at.x, y: at.y });
    m.step();
    expect(m.state.gold).toBe(gold + 10); // 노말 15원이지만 지금 소환 비용 22원 → 상한 ⌊21/2⌋ = 10 (V2.0 PR-A)
    expect(eventsOf(m, 'sellFail').map((e) => e.reason)).toEqual(['noTower']);
  });

  it('승급의 축복 선택이 걸린 타워를 팔면 선택도 사라진다', () => {
    const m = arena();
    const at = put(m, idsOf('rare')[0]!);
    const t = towerAt(m.world, at.x, at.y)!;
    m.state.mergePicks.push({ player: 0, id: t.id, alt: idsOf('rare')[1]! });
    command(m, { type: 'sellTower', x: at.x, y: at.y });
    expect(m.state.mergePicks).toEqual([]);
  });

  it('되파는 돈벌이가 안 된다 (V2.0 PR-A): 소환 22원 → 판매 11원 이하 · 레어 표 판매가 45원도 ⌊(지금 소환 비용 24 − 1) ÷ 2⌋ = 11원까지 (쌍둥이 둘을 팔아도 손해)', () => {
    const m = arena();
    const gold = m.state.gold;
    const [x, y] = m.map.buildable[0]!;
    command(m, { type: 'summon', x, y });
    command(m, { type: 'sellTower', x, y });
    const got = m.state.gold - (gold - 22);
    expect(got).toBeLessThan(22);
    const at = put(m, idsOf('rare')[0]!);
    const g1 = m.state.gold;
    command(m, { type: 'sellTower', x: at.x, y: at.y });
    expect(m.state.gold - g1).toBe(11); // ⌊(지금 소환 비용 24원 − 1) ÷ 2⌋
  });

  it('판매가 섞인 판도 결정적이다 (같은 명령 → 같은 해시)', () => {
    const run = (): number => {
      const m = infinite(7, { debug: true });
      const [x, y] = m.map.buildable[3]!;
      command(m, { type: 'summon', x, y });
      m.stepN(30);
      command(m, { type: 'sellTower', x, y });
      m.stepN(30);
      return m.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('debugConvertTower 명령 (개발자 판만)', () => {
  it('같은 등급의 다른 타워로 그 자리에서 바꾼다 (같은 엔티티·칸), debugUsed, convert 사건', () => {
    const m = arena(1, { debug: true });
    const [a, b] = idsOf('legend');
    const at = put(m, a!);
    const before = towerAt(m.world, at.x, at.y)!;
    const id = before.id;
    command(m, { type: 'debugConvertTower', x: at.x, y: at.y, t: indexOf(b!) });
    const after = towerAt(m.world, at.x, at.y)!;
    expect(after.id).toBe(id);
    expect(after.tower).toBe(b);
    expect(m.state.debugUsed).toBe(true);
    expect(eventsOf(m, 'convert')[0]).toMatchObject({ from: a, tower: b, grade: 'legend', id });
  });

  it('일반 판은 무시 (notDebug), 다른 등급·같은 타워·없는 번호는 거절', () => {
    const plain = arena();
    const at = put(plain, idsOf('normal')[0]!);
    command(plain, { type: 'debugConvertTower', x: at.x, y: at.y, t: indexOf(idsOf('normal')[1]!) });
    expect(towerAt(plain.world, at.x, at.y)!.tower).toBe(idsOf('normal')[0]);
    expect(plain.state.debugUsed).toBe(false);
    expect(eventsOf(plain, 'convertFail')[0]?.reason).toBe('notDebug');

    const m = arena(1, { debug: true });
    const p = put(m, idsOf('normal')[0]!);
    command(m, { type: 'debugConvertTower', x: p.x, y: p.y, t: indexOf(idsOf('rare')[0]!) });
    command(m, { type: 'debugConvertTower', x: p.x, y: p.y, t: indexOf(idsOf('normal')[0]!) });
    command(m, { type: 'debugConvertTower', x: p.x, y: p.y, t: 250 });
    expect(eventsOf(m, 'convertFail').map((e) => e.reason)).toEqual(['grade', 'same', 'unknown']);
    expect(m.state.debugUsed).toBe(false);
  });

  it('고르기 목록 = 같은 등급의 다른 타워 (노말~레전드 9종 + 자기 = 10, 신 2, 히든 11)', () => {
    expect(convertTargets(rules, idsOf('normal')[0]!)).toHaveLength(9);
    expect(convertTargets(rules, idsOf('legend')[3]!)).toHaveLength(9);
    expect(convertTargets(rules, idsOf('god')[0]!)).toHaveLength(2);
    expect(convertTargets(rules, idsOf('hidden')[0]!)).toHaveLength(11);
    expect(convertTargets(rules, idsOf('hero')[0]!)).not.toContain(idsOf('hero')[0]);
  });
});

describe('debugSetChance 명령 (개발자 확률 조정)', () => {
  it('신 타워 확률: 기본 0.01% → 0.1%p씩, 소환 판정이 그 값을 쓴다, 판마다 기본값', () => {
    const m = arena(1, { debug: true });
    expect(chanceValue(m.rules, m.state, 'god')).toBe(1);
    command(m, { type: 'debugSetChance', key: 'god', bp: 10 });
    expect(chanceValue(m.rules, m.state, 'god')).toBe(10);
    command(m, { type: 'debugSetChance', key: 'god', bp: 10000 });
    // 100%면 소환이 모두 신 타워
    const [x, y] = m.map.buildable[0]!;
    command(m, { type: 'summon', x, y });
    expect(rules.towers.get(towerAt(m.world, x, y)!.tower)?.grade).toBe('god');
    expect(m.state.debugUsed).toBe(true);
    // 새 판은 기본값 (덮어쓴 값이 없다)
    const fresh = arena(1, { debug: true });
    expect(fresh.state.chanceOv).toBeUndefined();
    expect(chanceValue(fresh.rules, fresh.state, 'god')).toBe(1);
  });

  it('검사: 일반 판·모르는 key·단위(10bp)가 아님 → chanceSetFail, 상태 그대로', () => {
    const plain = arena();
    command(plain, { type: 'debugSetChance', key: 'god', bp: 100 });
    expect(plain.state.chanceOv).toBeUndefined();
    const m = arena(1, { debug: true });
    command(m, { type: 'debugSetChance', key: 'nope', bp: 100 });
    command(m, { type: 'debugSetChance', key: 'god', bp: 15 });
    expect(eventsOf(m, 'chanceSetFail').map((e) => e.reason)).toEqual(['unknown', 'step']);
    expect(m.state.chanceOv).toBeUndefined();
    expect(m.state.debugUsed).toBe(false);
    // 명령 내용 검사 (네트워크로 받은 값)
    expect(validatePayload({ type: 'debugSetChance', key: 'god', bp: 10001 })).toContain('bp');
    expect(validatePayload({ type: 'debugSetChance', key: 'god', bp: -2 })).toContain('bp');
    expect(validatePayload({ type: 'debugSetChance', key: 3, bp: 10 })).toContain('key');
    expect(validatePayload({ type: 'debugSetChance', key: '<script>', bp: 10 })).toContain('key');
    expect(validatePayload({ type: 'debugSetChance', key: 'gamble:1', bp: -1 })).toBeNull();
    expect(validatePayload({ type: 'sellTower', x: 1, y: 2 })).toBeNull();
    expect(validatePayload({ type: 'sellTower', x: -1, y: 2 })).toContain('x');
    expect(validatePayload({ type: 'debugConvertTower', x: 1, y: 2 })).toContain('t');
  });

  it('도박 확률: ×0이 나머지를 흡수해 합 100%, ×0이 0 아래로 내려가지 않게 잘림, 기대값이 바뀐다', () => {
    const m = arena(1, { debug: true });
    const base = gambleExpectationBp(gambleRulesOf(m.ctx));
    command(m, { type: 'debugSetChance', key: 'gamble:5', bp: 810 }); // ×5 8% → 8.1%
    const eff = effectiveGambleOutcomes(m.rules, m.state);
    expect(eff.map((o) => o.chanceBp)).toEqual([3490, 1100, 2100, 1300, 1200, 810]);
    expect(eff.reduce((s, o) => s + o.chanceBp, 0)).toBe(10000);
    expect(gambleExpectationBp(gambleRulesOf(m.ctx))).toBeGreaterThan(base);
    // ×1을 100%로 → 다른 배율(×0 제외) 합만큼 잘림, ×0 = 0
    expect(chanceMaxBp(m.rules, m.state, 'gamble:2')).toBe(10000 - 1100 - 1300 - 1200 - 810);
    command(m, { type: 'debugSetChance', key: 'gamble:2', bp: 10000 });
    const eff2 = effectiveGambleOutcomes(m.rules, m.state);
    expect(eff2[0]!.chanceBp).toBe(0);
    expect(eff2.reduce((s, o) => s + o.chanceBp, 0)).toBe(10000);
    expect(eventsOf(m, 'chanceSet').at(-1)).toMatchObject({ key: 'gamble:2', bp: 10000 - 1100 - 1300 - 1200 - 810 });
    // 되돌리기: key 하나 (bp −1), 모두 (key 'all')
    command(m, { type: 'debugSetChance', key: 'gamble:2', bp: -1 });
    expect(effectiveGambleOutcomes(m.rules, m.state)[2]!.chanceBp).toBe(2100);
    command(m, { type: 'debugSetChance', key: 'all', bp: -1 });
    expect(m.state.chanceOv).toBeUndefined();
    expect(effectiveGambleOutcomes(m.rules, m.state)).toBe(m.rules.gambleOutcomes);
  });

  it('도박 확률 조정이 실제 도박에 쓰인다: ×5 100% → 10원이 50원, 잭팟 차례에 ×3·×5가 0%여도 멈추지 않음', () => {
    const m = arena(1, { debug: true });
    for (const k of [1, 2, 3, 4]) command(m, { type: 'debugSetChance', key: `gamble:${k}`, bp: 0 });
    command(m, { type: 'debugSetChance', key: 'gamble:5', bp: 10000 });
    const gold = m.state.gold;
    command(m, { type: 'gamble', t: 0 });
    expect(m.state.gold).toBe(gold - 10 + 50);
    // ×3·×5 모두 0%인 채로 잭팟 → 데이터 비율로
    command(m, { type: 'debugSetChance', key: 'gamble:5', bp: 0 });
    m.state.gamble[0]!.gauge = m.rules.jackpotGauge;
    command(m, { type: 'gamble', t: 0 });
    const ev = eventsOf(m, 'gamble').at(-1)!;
    expect(ev.jackpot).toBe(true);
    expect(ev.mul as number).toBeGreaterThanOrEqual(30000);
    expect(gambleWeights(gambleRulesOf(m.ctx), 0, false)[0]).toBe(10000);
  });

  it('치명타 보너스: 모든 타워 치명타 확률 + (패널·전투가 같이 쓰는 effectiveStats)', () => {
    const m = arena(1, { debug: true });
    const at = put(m, idsOf('normal')[0]!);
    const t = towerAt(m.world, at.x, at.y)!;
    const stats = rules.towers.get(t.tower)!;
    const critOf = (): number => effectiveStats(rules, stats, m.state.mods[0], towerBonus(m.ctx, t, computeAuras(m.ctx, m.world))).critBp;
    const before = critOf();
    command(m, { type: 'debugSetChance', key: 'critBonus', bp: 2500 });
    expect(critOf()).toBe(Math.min(before + 2500, rules.critChanceMaxBp));
  });

  it('카드 희귀·정예·레어 직행·2등급 승급도 값이 바뀐다 (목록 = game.json devChances)', () => {
    const m = arena(1, { debug: true });
    expect(m.rules.devChanceKeys).toEqual(data.game.devChances.list.map((c) => c.key));
    command(m, { type: 'debugSetChance', key: 'cardRare', bp: 10000 });
    command(m, { type: 'debugSetChance', key: 'elite', bp: 5000 });
    command(m, { type: 'debugSetChance', key: 'summonRare', bp: 10000 });
    expect(chanceValue(m.rules, m.state, 'cardRare')).toBe(10000);
    expect(chanceValue(m.rules, m.state, 'elite')).toBe(5000);
    // 레어 직행 100% → 소환하면 레어
    const [x, y] = m.map.buildable[0]!;
    command(m, { type: 'summon', x, y });
    expect(rules.towers.get(towerAt(m.world, x, y)!.tower)?.grade).toBe('rare');
  });

  it('확률 조정이 든 판의 리플레이 왕복: 기록 → JSON → 재생 = 같은 해시 (판매·변환 포함)', () => {
    const m = infinite(11, { debug: true });
    const [x, y] = m.map.buildable[2]!;
    command(m, { type: 'debugSetChance', key: 'gamble:4', bp: 1000 });
    command(m, { type: 'debugSetChance', key: 'critBonus', bp: 500 });
    command(m, { type: 'summon', x, y });
    command(m, { type: 'debugConvertTower', x, y, t: indexOf(idsOf('normal').find((id) => id !== towerAt(m.world, x, y)!.tower)!) });
    command(m, { type: 'gamble', t: 0 });
    m.stepN(40);
    command(m, { type: 'sellTower', x, y });
    m.stepN(20);
    const file = recordReplay(arenaData, m, { name: 't2-roundtrip' });
    const back = JSON.parse(replayToJson(file));
    const r = playReplay(arenaData, back);
    expect(r.mismatch).toBeNull();
    expect(r.hash).toBe(m.hash());
    expect(r.match.state.chanceOv).toEqual({ 'gamble:4': 1000, critBonus: 500 });
  });
});

describe('테이블 동시 도박 + 미션 (T-2)', () => {
  it('같은 틱에 10원·100원 두 테이블 → 둘 다 실행 (명령 순서대로), 도박 횟수 +2, 잭팟 게이지는 하나를 같이 쓴다', () => {
    const m = arena();
    const gold = m.state.gold;
    m.world.enqueue({ type: 'gamble', t: 0 });
    m.world.enqueue({ type: 'gamble', t: 1 });
    m.step();
    const ev = eventsOf(m, 'gamble');
    expect(ev.map((e) => e.t)).toEqual([0, 1]);
    expect(m.state.gambles).toBe(2);
    expect(m.state.gold).toBe(gold - 110 + (ev[0]!.win as number) + (ev[1]!.win as number));
    // 두 번째 도박의 '직전 보유금'은 첫 도박 뒤
    expect(ev[1]!.before).toBe(gold - 10 + (ev[0]!.win as number));
    const zeros = ev.filter((e) => e.mul === 0).length;
    expect(m.state.gamble[0]!.gauge).toBe(zeros);
  });

  it('n18 도박 10회: 테이블을 섞어도 모두 센다', () => {
    const m = arena();
    const i = m.rules.missions.findIndex((x) => x.id === 'n18');
    for (let k = 0; k < 5; k++) {
      m.world.enqueue({ type: 'gamble', t: 0 });
      m.world.enqueue({ type: 'gamble', t: 1 });
      m.step();
    }
    expect(m.state.gambles).toBe(10);
    expect(m.state.missionStatus[i]).not.toBe(MISSION_OPEN);
  });

  it('n19·h10 (1000원 테이블)는 1000원 도박만 보고, h02 (0원 연속, 테이블 없음)는 모든 도박을 실행 순서대로 본다', () => {
    const m = arena(1, { accountLevels: [7], debug: true });
    // 확률 조정으로 결과를 정한다: ×5 100% → 1000원 ×5 두 번 사이에 10원 도박을 끼워도 도박왕
    for (const k of [1, 2, 3, 4]) command(m, { type: 'debugSetChance', key: `gamble:${k}`, bp: 0 });
    command(m, { type: 'debugSetChance', key: 'gamble:5', bp: 10000 });
    m.state.gold = 1_000_000;
    const done = (id: string): boolean => m.state.missionStatus[m.rules.missions.findIndex((x) => x.id === id)] !== MISSION_OPEN;
    m.world.enqueue({ type: 'gamble', t: 2 });
    m.world.enqueue({ type: 'gamble', t: 0 });
    m.step();
    expect(done('n19')).toBe(true);
    expect(done('h10')).toBe(false);
    m.world.enqueue({ type: 'gamble', t: 0 });
    m.world.enqueue({ type: 'gamble', t: 2 });
    m.step();
    expect(done('h10')).toBe(true);
    // h02: ×0 100%로 바꾸고 10원·100원을 번갈아 5번 → 0원 5연속
    command(m, { type: 'debugSetChance', key: 'gamble:5', bp: 0 });
    for (let k = 0; k < 5; k++) command(m, { type: 'gamble', t: k % 2 });
    expect(done('h02')).toBe(true);
  });

  it('h03 인생 역전: 도박 직전 보유금 10원 이하 + 10원 테이블 ×5 (같은 틱 다른 테이블 도박 뒤 보유금으로 판정)', () => {
    const m = arena(1, { debug: true });
    for (const k of [1, 2, 3, 4]) command(m, { type: 'debugSetChance', key: `gamble:${k}`, bp: 0 });
    command(m, { type: 'debugSetChance', key: 'gamble:5', bp: 10000 });
    m.state.gold = 10;
    command(m, { type: 'gamble', t: 0 });
    expect(m.state.missionStatus[m.rules.missions.findIndex((x) => x.id === 'h03')]).not.toBe(MISSION_OPEN);
  });
});

describe('자동 소환 칸 (꾹 눌러 연속 소환·[🎲 소환] 버튼)', () => {
  /** 작은 시험 맵: P = 경로, B = 배치, . = 장식 */
  function fakeMap(rows: string[]): SimMap {
    const kinds = rows.join('').split('').map((c) => (c === 'P' ? 'path' : c === 'B' ? 'build' : 'decor'));
    const buildable: [number, number][] = [];
    rows.forEach((r, y) => r.split('').forEach((c, x) => c === 'B' && buildable.push([x, y])));
    return { width: rows[0]!.length, height: rows.length, kinds, buildable } as unknown as SimMap;
  }

  it('둘레 2칸 안 경로 칸이 가장 많은 빈 칸, 같으면 y가 작은 칸 → x가 작은 칸', () => {
    const map = fakeMap(['BBBBB', 'BPPPB', 'BBBBB', 'BB.BB', 'BBBBB']);
    const m = arena();
    const ctx = { map, rules: { ...m.rules, autoSummonRadius: 2 } } as unknown as Parameters<typeof autoSummonTile>[0];
    expect(pathTilesAround(map, 2, 0, 2)).toBe(3);
    expect(pathTilesAround(map, 2, 4, 2)).toBe(0);
    // (1,0)·(2,0)·(3,0)·(0,2)… 중 경로 3칸을 모두 보는 칸 중 y 가장 작은 줄의 가장 왼쪽
    const empty = { ...m.world, entities: { list: () => [] } } as unknown as Match['world'];
    expect(autoSummonTile(ctx, empty)).toEqual([1, 0]);
    expect(autoSummonTile(ctx, empty, new Set(['1,0']))).toEqual([2, 0]);
    // 빈 칸이 없으면 null
    const all = new Set(map.buildable.map(([x, y]) => `${x},${y}`));
    expect(autoSummonTile(ctx, empty, all)).toBeNull();
  });

  it('지금 맵에서도 고른 칸이 점수 최대·순서 규칙과 같고, 판 위 타워 칸은 건너뛴다 (맵 좌표에 기대지 않음)', () => {
    const m = arena();
    const r = m.rules.autoSummonRadius;
    const pick = autoSummonTile(m.ctx, m.world)!;
    const best = Math.max(...m.map.buildable.map(([x, y]) => pathTilesAround(m.map, x, y, r)));
    expect(pathTilesAround(m.map, pick[0], pick[1], r)).toBe(best);
    const first = m.map.buildable
      .filter(([x, y]) => pathTilesAround(m.map, x, y, r) === best)
      .sort((a, b) => a[1] - b[1] || a[0] - b[0])[0]!;
    expect(pick).toEqual(first);
    command(m, { type: 'summon', x: pick[0], y: pick[1] });
    expect(autoSummonTile(m.ctx, m.world)).not.toEqual(pick);
  });
});
