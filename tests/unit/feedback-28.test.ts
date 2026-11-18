/**
 * 피드백 #28 '인구수(인원 한도)를 돈으로 사기': [⬆ 강화]에 '인원 한도 +1' 강화 (살수록 비싸지고 최대치가 있음, 수치는 game.json upgrade.unitCap).
 * 이슈에 판 기록 JSON이 없어, 새 강화가 든 판을 src/sim/replay.ts로 기록 → JSON → 재생해 같은 해시인지 본다.
 */
import { describe, expect, it } from 'vitest';
import { listTowers } from '../../src/sim/entities/Tower';
import { playReplay, recordReplay, replayToJson } from '../../src/sim/replay';
import { buildMatchRules } from '../../src/sim/rules';
import { unitCap } from '../../src/sim/systems/Board';
import { affordableUpgrades, upgradeById, upgradeCheck, upgradeCost, upgradeLevel } from '../../src/sim/systems/Upgrade';
import { upgradeSheetModel } from '../../src/ui/sheets/sheetModels';
import { arena, command, data, eventsOf, realInfinite } from '../helpers/match';

const rules = buildMatchRules(data);
const cfg = data.game.upgrade.unitCap;
const capUp = upgradeById(rules, cfg.id)!;

describe('인원 한도 강화 데이터 (game.json upgrade.unitCap)', () => {
  it('강화 목록 맨 끝(초월 다음)에 붙어 예전 강화 k는 그대로', () => {
    expect(capUp).toBeDefined();
    expect(capUp.kind).toBe('unitCap');
    expect(capUp.k).toBe(rules.upgrades.length - 1);
    expect(capUp.k).toBe(rules.transcendK + 1);
    expect(rules.upgrades.slice(0, capUp.k).map((u) => u.id)).toEqual(['normal', 'hero', 'legend', 'aps', 'armorPen', 'magicPen', 'crit', 'critDmg', 'range', 'transcend']);
  });

  it('살수록 비싸지고(cost[0] + cost[1] × Lv) 최대치가 있다 — 값은 JSON에서', () => {
    expect(cfg.perLevel).toBeGreaterThan(0);
    expect(cfg.cost[1]).toBeGreaterThan(0);
    expect(capUp.max).toBe(cfg.max);
    expect(upgradeCost(rules, capUp, 0)).toBe(cfg.cost[0]);
    expect(upgradeCost(rules, capUp, 1)).toBe(cfg.cost[0] + cfg.cost[1]);
    expect(upgradeCost(rules, capUp, cfg.max - 1)).toBe(cfg.cost[0] + cfg.cost[1] * (cfg.max - 1));
    expect(upgradeCost(rules, capUp, cfg.max)).toBeNull();
  });
});

describe('인원 한도 강화 규칙', () => {
  it('upgrade 명령 한 번 = 돈을 내고 인원 한도 +perLevel, 다음 비용은 더 비쌈', () => {
    const m = arena(28);
    m.state.gold = 100_000;
    const before = unitCap(m.ctx, 0);
    expect(before).toBe(rules.unitCap);
    command(m, { type: 'upgrade', k: capUp.k });
    expect(m.state.gold).toBe(100_000 - cfg.cost[0]);
    expect(upgradeLevel(m.state, 0, capUp.k)).toBe(1);
    expect(unitCap(m.ctx, 0)).toBe(before + cfg.perLevel);
    expect(eventsOf(m, 'upgrade').at(-1)).toMatchObject({ k: capUp.k, id: cfg.id, lv: 1, cost: cfg.cost[0] });
    command(m, { type: 'upgrade', k: capUp.k });
    expect(m.state.gold).toBe(100_000 - cfg.cost[0] - (cfg.cost[0] + cfg.cost[1]));
    expect(unitCap(m.ctx, 0)).toBe(before + 2 * cfg.perLevel);
  });

  it('최대치까지만: 최대면 max로 실패하고 돈·한도 그대로 · 카드 부대 확장과 더해진다', () => {
    const m = arena(29);
    m.state.gold = 10_000_000;
    expect(affordableUpgrades(m.ctx, 0, capUp.k)).toBe(cfg.max);
    for (let i = 0; i < cfg.max; i++) command(m, { type: 'upgrade', k: capUp.k });
    expect(upgradeCheck(m.ctx, 0, capUp.k)).toBe('max');
    const gold = m.state.gold;
    command(m, { type: 'upgrade', k: capUp.k });
    expect(eventsOf(m, 'upgradeFail').at(-1)).toMatchObject({ k: capUp.k, reason: 'max' });
    expect(m.state.gold).toBe(gold);
    expect(unitCap(m.ctx, 0)).toBe(rules.unitCap + cfg.max * cfg.perLevel);
    m.state.unitCapBonus[0] = 3; // 카드 '부대 확장'
    expect(unitCap(m.ctx, 0)).toBe(rules.unitCap + cfg.max * cfg.perLevel + 3);
  });

  it('돈이 모자라면 gold로 실패 (돈 그대로)', () => {
    const m = arena(30);
    m.state.gold = cfg.cost[0] - 1;
    expect(upgradeCheck(m.ctx, 0, capUp.k)).toBe('gold');
    command(m, { type: 'upgrade', k: capUp.k });
    expect(m.state.gold).toBe(cfg.cost[0] - 1);
    expect(unitCap(m.ctx, 0)).toBe(rules.unitCap);
  });

  it('한도가 차서 소환이 막힌 판에서 인원을 사면 다시 소환된다', () => {
    const m = realInfinite(19);
    m.state.gold = 100_000;
    for (let i = 0; i < rules.unitCap + 3; i++) command(m, { type: 'summonAuto' });
    expect(listTowers(m.world)).toHaveLength(rules.unitCap);
    expect(eventsOf(m, 'summonFail').at(-1)?.reason).toBe('cap');
    command(m, { type: 'upgrade', k: capUp.k });
    for (let i = 0; i < cfg.perLevel + 2; i++) command(m, { type: 'summonAuto' });
    expect(listTowers(m.world)).toHaveLength(rules.unitCap + cfg.perLevel);
  });
});

describe('⬆ 강화 시트: 능력치 탭에 인원 한도 줄', () => {
  it("'Lv 0/최대' · '20명 → 21명' · 비용 · 대상 '내 타워 인원'", () => {
    const m = arena(31);
    m.state.gold = 100_000;
    let s = upgradeSheetModel(m.ctx, 0);
    expect(s.unitCap).toMatchObject({
      id: cfg.id,
      k: capUp.k,
      levelText: `Lv 0/${cfg.max}`,
      effect: `${rules.unitCap}명 → ${rules.unitCap + cfg.perLevel}명`,
      cost: cfg.cost[0],
      state: 'ok',
      target: '내 타워 인원 한도',
    });
    for (let i = 0; i < cfg.max; i++) command(m, { type: 'upgrade', k: capUp.k });
    s = upgradeSheetModel(m.ctx, 0);
    expect(s.unitCap).toMatchObject({ effect: `${rules.unitCap + cfg.max * cfg.perLevel}명 (최대)`, costText: '최대', state: 'max' });
    // 능력치 6줄은 그대로 (인원 한도는 따로)
    expect(s.stat.map((r) => r.id)).toEqual(['aps', 'armorPen', 'magicPen', 'crit', 'critDmg', 'range']);
  });
});

describe('결정성: 인원 한도 강화가 든 판의 리플레이 왕복 (src/sim/replay.ts)', () => {
  it('debugAddGold → 인원 강화 → 한도까지 소환 → 기록 → JSON → 재생 = 같은 해시·같은 한도', () => {
    const m = realInfinite(2828, { debug: true });
    command(m, { type: 'debugAddGold', amount: 100_000 });
    for (let i = 0; i < 3; i++) command(m, { type: 'upgrade', k: capUp.k });
    for (let i = 0; i < rules.unitCap + 3 * cfg.perLevel + 2; i++) command(m, { type: 'summonAuto' });
    m.stepN(200);
    expect(listTowers(m.world).length).toBeLessThanOrEqual(rules.unitCap + 3 * cfg.perLevel);
    const file = recordReplay(data, m, { name: 'feedback-28' });
    const back = JSON.parse(replayToJson(file));
    let replayCap = -1;
    const r = playReplay(data, back, { onStep: (rm) => (replayCap = unitCap(rm.ctx, 0)) });
    expect(r.mismatch).toBeNull();
    expect(r.hash).toBe(m.hash());
    expect(replayCap).toBe(rules.unitCap + 3 * cfg.perLevel);
  });
});
