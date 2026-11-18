/**
 * 피드백 #27 '소환 확률을 높이는 강화를 돈으로 사기': [⬆ 강화]에 '소환 확률' 강화 (game.json upgrade.summon).
 * 레벨마다 레어 직행 소환 확률 +perLevel, 비용 cost[0] + cost[1] × Lv. 명령 k는 기존 강화 뒤(초월 다음)라 예전 k·저장은 그대로.
 * (이슈에 판 기록 JSON이 없어 리플레이 재현 테스트는 없다.)
 */
import { describe, expect, it } from 'vitest';
import { buildMatchRules } from '../../src/sim/rules';
import { towerAt } from '../../src/sim/entities/Tower';
import { summonRareChance } from '../../src/sim/systems/Summon';
import { upgradeById, upgradeCheck, upgradeCost, upgradeLevel } from '../../src/sim/systems/Upgrade';
import { upgradeSheetModel } from '../../src/ui/sheets/sheetModels';
import { command, data, eventsOf, infinite } from '../helpers/match';

const rules = buildMatchRules(data);
const cfg = data.game.upgrade.summon;
const luck = (): NonNullable<ReturnType<typeof upgradeById>> => {
  const u = upgradeById(rules, cfg.id);
  if (!u) throw new Error('소환 확률 강화가 없다');
  return u;
};

describe('소환 확률 강화 데이터 (game.json upgrade.summon)', () => {
  it('기존 강화 순서·k는 그대로, 소환 확률은 맨 뒤 (초월 다음)', () => {
    expect(rules.upgrades.slice(0, 10).map((u) => u.id)).toEqual(['normal', 'hero', 'legend', 'aps', 'armorPen', 'magicPen', 'crit', 'critDmg', 'range', 'transcend']);
    expect(rules.transcendK).toBe(9);
    const u = luck();
    expect(u.k).toBe(10);
    expect(u.kind).toBe('summon');
    expect(u.name).toBe('소환 확률');
    expect(u.icon).toBe(cfg.icon);
    expect(u.max).toBe(cfg.max);
    expect(u.perLevelBp).toBe(Math.round(cfg.rarePerLevel * 10000));
    expect(u.perLevelBp).toBeGreaterThan(0);
  });

  it('비용이 레벨마다 오른다: cost[0] + cost[1] × Lv, 최대면 null', () => {
    const u = luck();
    expect(upgradeCost(rules, u, 0)).toBe(cfg.cost[0]);
    expect(upgradeCost(rules, u, 3)).toBe(cfg.cost[0] + cfg.cost[1] * 3);
    expect(cfg.cost[1]).toBeGreaterThan(0);
    expect(upgradeCost(rules, u, u.max)).toBeNull();
  });
});

describe('소환 확률 강화 명령', () => {
  it('돈을 내고 레벨이 오르면 레어 직행 소환 확률이 레벨 × perLevel만큼 오른다', () => {
    const m = infinite(1);
    const u = luck();
    expect(summonRareChance(m.ctx, m.world, 0)).toBe(0);
    const gold = m.state.gold;
    command(m, { type: 'upgrade', k: u.k });
    command(m, { type: 'upgrade', k: u.k });
    expect(upgradeLevel(m.state, 0, u.k)).toBe(2);
    expect(m.state.gold).toBe(gold - cfg.cost[0] - (cfg.cost[0] + cfg.cost[1]));
    expect(summonRareChance(m.ctx, m.world, 0)).toBe(u.perLevelBp * 2);
    expect(eventsOf(m, 'upgrade').map((e) => e.id)).toEqual([cfg.id, cfg.id]);
  });

  it('돈이 모자라면 실패, 최대 레벨이면 max', () => {
    const m = infinite(1);
    const u = luck();
    m.state.gold = cfg.cost[0] - 1;
    expect(upgradeCheck(m.ctx, 0, u.k)).toBe('gold');
    m.state.upgrades[0]![u.k] = u.max;
    m.state.gold = 1_000_000;
    expect(upgradeCheck(m.ctx, 0, u.k)).toBe('max');
  });

  it('최대 레벨이면 실제 소환에서 레어가 나온다 (강화 없으면 같은 시드에서 노말만)', () => {
    const u = luck();
    const rareCount = (lv: number): number => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const m = infinite(seed);
        m.state.upgrades[0]![u.k] = lv;
        const [x, y] = m.map.buildable[0]!;
        command(m, { type: 'summon', x, y });
        if (rules.towers.get(towerAt(m.world, x, y)!.tower)?.grade === 'rare') n++;
      }
      return n;
    };
    expect(rareCount(0)).toBe(0);
    expect(rareCount(u.max)).toBeGreaterThan(0);
  });

  it('예전 판 상태(강화 배열 10칸)도 Lv0으로 읽고 강화할 수 있다', () => {
    const m = infinite(1);
    const u = luck();
    m.state.upgrades[0] = m.state.upgrades[0]!.slice(0, 10);
    expect(upgradeLevel(m.state, 0, u.k)).toBe(0);
    command(m, { type: 'upgrade', k: u.k });
    expect(upgradeLevel(m.state, 0, u.k)).toBe(1);
  });
});

describe('⬆ 강화 시트', () => {
  it('능력치 탭 맨 아래에 소환 확률 줄: 효과 %p, 대상 소환', () => {
    const m = infinite(1);
    const u = luck();
    const row = upgradeSheetModel(m.ctx, 0).stat.at(-1)!;
    expect(row).toMatchObject({ id: cfg.id, name: '소환 확률', levelText: `Lv 0/${u.max}`, costText: `${cfg.cost[0]}원`, state: 'ok' });
    expect(row.effect).toMatch(/^\+0%p → \+[\d.]+%p$/);
    expect(row.target).toContain('소환');
  });
});
