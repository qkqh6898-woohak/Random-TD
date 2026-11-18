/**
 * M5-3·M5-4 판 내 강화: 등급 강화 3종(최대 50) + 능력치 강화 6종 + 초월, 비용 공식(GDD 7.1), 길게 눌러 연속(명령 여러 번),
 * 효과(등급군 공격력·공속·관통·치명·사거리), 한도(공속 ×5·15회/초, 관통 90%, 치명 100%).
 */
import { describe, expect, it } from 'vitest';
import { BP_ONE } from '../../src/sim/Fixed';
import { buildMatchRules } from '../../src/sim/rules';
import { effectiveStats } from '../../src/sim/stats';
import { towerBonus } from '../../src/sim/systems/Aura';
import { damageAgainst, damageCaps } from '../../src/sim/systems/Damage';
import { placeTower } from '../../src/sim/systems/Summon';
import {
  affordableUpgrades,
  gradeUpgradeBp,
  transcendOpen,
  upgradeApsMulBp,
  upgradeById,
  upgradeCheck,
  upgradeCost,
  upgradeEffectBp,
  upgradeLevel,
} from '../../src/sim/systems/Upgrade';
import { arena, command, data, eventsOf, infinite, mobAt } from '../helpers/match';

const rules = buildMatchRules(data);
const K = (id: string): number => {
  const u = upgradeById(rules, id);
  if (!u) throw new Error(`강화 없음: ${id}`);
  return u.k;
};

describe('강화 데이터 (GDD 7.1)', () => {
  it('순서: 등급 강화 3종 → 능력치 강화 6종 → 초월 → 소환 확률(피드백 #27) → 인원 한도(피드백 #28) (명령 k = 이 순서, 뒤에 붙어 예전 k 그대로)', () => {
    expect(rules.upgrades.map((u) => u.id)).toEqual(['normal', 'hero', 'legend', 'aps', 'armorPen', 'magicPen', 'crit', 'critDmg', 'range', 'transcend', 'summonLuck', 'unitCap']);
    expect(rules.upgrades.map((u) => u.kind)).toEqual(['grade', 'grade', 'grade', 'stat', 'stat', 'stat', 'stat', 'stat', 'stat', 'transcend', 'summon', 'unitCap']);
    expect(rules.upgrades.every((u, i) => u.k === i)).toBe(true);
    expect(rules.transcendK).toBe(9);
    expect(rules.unitCapK).toBe(11);
  });

  it('등급군: 일반 = 노말·레어, 영웅 = 유니크·히어로, 전설 = 레전드·신·히든 (모든 등급이 정확히 하나)', () => {
    expect(rules.gradeUpgradeOf.get('normal')).toBe(0);
    expect(rules.gradeUpgradeOf.get('rare')).toBe(0);
    expect(rules.gradeUpgradeOf.get('unique')).toBe(1);
    expect(rules.gradeUpgradeOf.get('hero')).toBe(1);
    expect(rules.gradeUpgradeOf.get('legend')).toBe(2);
    expect(rules.gradeUpgradeOf.get('god')).toBe(2);
    expect(rules.gradeUpgradeOf.get('hidden')).toBe(2);
  });

  it('효과/Lv·최대: 등급 +10%·50, 공속 +4%·50, 관통 +2%·30, 치명 +1%p·30, 치명 피해 +10%p·30, 사거리 +2%·10, 초월 +5%', () => {
    const v = rules.upgrades.map((u) => [u.id, u.perLevelBp, u.max]);
    expect(v.slice(0, 9)).toEqual([
      ['normal', 1000, 50],
      ['hero', 1000, 50],
      ['legend', 1000, 50],
      ['aps', 400, 50],
      ['armorPen', 200, 30],
      ['magicPen', 200, 30],
      ['crit', 100, 30],
      ['critDmg', 1000, 30],
      ['range', 200, 10],
    ]);
    expect(rules.upgrades[9]?.perLevelBp).toBe(500);
    // 최대치 효과 (GDD 표): 공속 +200%, 관통 60%, 치명 +30%p, 치명 피해 +300%p, 사거리 +20%
    expect(upgradeEffectBp(rules.upgrades[K('aps')]!, 50)).toBe(20000);
    expect(upgradeEffectBp(rules.upgrades[K('armorPen')]!, 30)).toBe(6000);
    expect(upgradeEffectBp(rules.upgrades[K('crit')]!, 30)).toBe(3000);
    expect(upgradeEffectBp(rules.upgrades[K('critDmg')]!, 30)).toBe(30000);
    expect(upgradeEffectBp(rules.upgrades[K('range')]!, 10)).toBe(2000);
  });
});

describe('비용 공식 (GDD 7.1: Lv → Lv+1)', () => {
  const cost = (id: string, lv: number): number | null => upgradeCost(rules, rules.upgrades[K(id)]!, lv);

  it('등급 강화: 일반 50 + 50·Lv, 영웅 200 + 100·Lv, 전설 500 + 250·Lv', () => {
    expect([0, 1, 2, 9, 49].map((lv) => cost('normal', lv))).toEqual([50, 100, 150, 500, 2500]);
    expect([0, 1, 49].map((lv) => cost('hero', lv))).toEqual([200, 300, 5100]);
    expect([0, 1, 49].map((lv) => cost('legend', lv))).toEqual([500, 750, 12750]);
  });

  it('능력치 강화: 공속 100 + 60·Lv, 관통 150 + 100·Lv, 치명·치명 피해 100 + 80·Lv, 사거리 300 + 200·Lv', () => {
    expect([0, 1, 49].map((lv) => cost('aps', lv))).toEqual([100, 160, 3040]);
    expect([0, 29].map((lv) => cost('armorPen', lv))).toEqual([150, 3050]);
    expect([0, 29].map((lv) => cost('magicPen', lv))).toEqual([150, 3050]);
    expect([0, 29].map((lv) => cost('crit', lv))).toEqual([100, 2420]);
    expect([0, 29].map((lv) => cost('critDmg', lv))).toEqual([100, 2420]);
    expect([0, 9].map((lv) => cost('range', lv))).toEqual([300, 2100]);
  });

  it('최대 레벨이면 비용 없음 (null)', () => {
    expect(cost('normal', 50)).toBeNull();
    expect(cost('aps', 50)).toBeNull();
    expect(cost('range', 10)).toBeNull();
  });

  it('일반 강화 0 → 50 전체 = 63,750원 (Σ 50 + 50·Lv)', () => {
    let sum = 0;
    for (let lv = 0; lv < 50; lv++) sum += cost('normal', lv) as number;
    expect(sum).toBe(63_750);
  });

  it('초월: 50,000 × 1.15^Lv 내림 (curves.json 표), 표 끝이 최대', () => {
    const t = rules.upgrades[rules.transcendK]!;
    expect([0, 1, 2, 3].map((lv) => upgradeCost(rules, t, lv))).toEqual([50000, 57500, 66125, 76043]);
    expect(t.max).toBe(rules.transcendCost.length);
    expect(upgradeCost(rules, t, t.max)).toBeNull();
  });
});

describe('upgrade 명령', () => {
  it('일반 강화 1회: 50원을 내고 Lv1, upgrade 사건, 강화 횟수 +1', () => {
    const m = infinite(1);
    command(m, { type: 'upgrade', k: 0 });
    expect(upgradeLevel(m.state, 0, 0)).toBe(1);
    expect(m.state.gold).toBe(1000 - 50);
    expect(m.state.upgradesBought).toBe(1);
    expect(eventsOf(m, 'upgrade')).toEqual([expect.objectContaining({ player: 0, k: 0, id: 'normal', lv: 1, cost: 50 })]);
  });

  it('길게 눌러 연속 = 같은 틱에 명령 여러 개: 돈이 허락하는 만큼 (1000원 → 일반 5회 = 750원), 나머지는 upgradeFail gold', () => {
    const m = infinite(1);
    expect(affordableUpgrades(m.ctx, 0, 0)).toBe(5);
    for (let i = 0; i < 8; i++) m.world.enqueue({ type: 'upgrade', k: 0 });
    m.step();
    expect(upgradeLevel(m.state, 0, 0)).toBe(5);
    expect(m.state.gold).toBe(1000 - 750);
    expect(m.state.upgradesBought).toBe(5);
    expect(eventsOf(m, 'upgradeFail').map((e) => e.reason)).toEqual(['gold', 'gold', 'gold']);
  });

  it('실패: 돈 부족 · 최대 · 초월 잠김 · 없는 강화 · 판 끝 — 상태 그대로', () => {
    const m = infinite(1);
    m.state.gold = 49;
    expect(upgradeCheck(m.ctx, 0, 0)).toBe('gold');
    m.state.gold = 1_000_000;
    m.state.upgrades[0]![K('range')] = 10;
    expect(upgradeCheck(m.ctx, 0, K('range'))).toBe('max');
    expect(upgradeCheck(m.ctx, 0, rules.transcendK)).toBe('locked');
    expect(upgradeCheck(m.ctx, 0, 99)).toBe('unknown');
    command(m, { type: 'upgrade', k: K('range') });
    command(m, { type: 'upgrade', k: rules.transcendK });
    expect(eventsOf(m, 'upgradeFail').map((e) => e.reason)).toEqual(['max', 'locked']);
    expect(m.state.gold).toBe(1_000_000);
    expect(m.state.upgradesBought).toBe(0);
    m.state.phase = 'defeat';
    expect(upgradeCheck(m.ctx, 0, 0)).toBe('phase');
  });

  it('플레이어마다 따로 (2인 판: 0번 강화가 1번 타워를 올리지 않는다)', () => {
    const m = infinite(1, { players: 2 });
    command(m, { type: 'upgrade', k: K('aps'), player: 0 });
    expect(upgradeLevel(m.state, 0, K('aps'))).toBe(1);
    expect(upgradeLevel(m.state, 1, K('aps'))).toBe(0);
    expect(m.state.mods[0]?.apsPctBp).toBe(400);
    expect(m.state.mods[1]?.apsPctBp).toBe(0);
  });
});

describe('효과', () => {
  it('등급 강화: 일반 강화는 노말·레어 타워(지금·나중 모두) 공격력 +10%/Lv, 유니크 이상은 그대로', () => {
    const m = arena(1);
    const goblin = placeTower(m.world, 'goblin', 0, 4, 0);
    const sniper = placeTower(m.world, 'sniper', 0, 5, 0);
    m.state.gold = 100_000;
    for (let i = 0; i < 3; i++) m.world.enqueue({ type: 'upgrade', k: 0 });
    m.step();
    const later = placeTower(m.world, 'merchant', 0, 6, 0); // 강화 뒤에 나온 레어
    const none = new Map();
    expect(towerBonus(m.ctx, goblin, none).atkPctBp).toBe(3000);
    expect(towerBonus(m.ctx, later, none).atkPctBp).toBe(3000);
    expect(towerBonus(m.ctx, sniper, none).atkPctBp).toBe(0);
    expect(gradeUpgradeBp(m.ctx, 0, 'rare')).toBe(3000);
    expect(gradeUpgradeBp(m.ctx, 0, 'unique')).toBe(0);
    const eff = effectiveStats(rules, rules.towers.get('goblin')!, m.state.mods[0], towerBonus(m.ctx, goblin, none));
    expect(eff.atkMulBp).toBe(13000);
  });

  it('능력치 강화 → PlayerMods: 공속 +4%, 물리·마법 관통 +2%, 치명 +1%p, 치명 피해 +10%p, 사거리 +2%', () => {
    const m = infinite(1);
    m.state.gold = 100_000;
    for (const id of ['aps', 'armorPen', 'magicPen', 'crit', 'critDmg', 'range']) command(m, { type: 'upgrade', k: K(id) });
    expect(m.state.mods[0]).toMatchObject({ apsPctBp: 400, armorPenBp: 200, magicPenBp: 200, critChanceBp: 100, critMulBp: 1000, rangePctBp: 200 });
  });

  it('사거리 강화가 실제 대상 고르기를 넓힌다: 고블린(1.5칸)에서 1.64칸 떨어진 몹 → 사거리 +20%(1.8칸)면 때린다', () => {
    const m = arena(1);
    const mob = mobAt(m, 'slime', 4300); // (5800, 1500): 고블린 (4500, 500)에서 √(1300² + 1000²) ≈ 1640
    const g = placeTower(m.world, 'goblin', 0, 4, 0);
    m.stepN(20);
    expect(g.attacks).toBe(0);
    m.state.gold = 100_000;
    for (let i = 0; i < 10; i++) m.world.enqueue({ type: 'upgrade', k: K('range') });
    m.step();
    expect(m.state.mods[0]?.rangePctBp).toBe(2000);
    expect(effectiveStats(rules, rules.towers.get('goblin')!, m.state.mods[0]).range).toBe(1800);
    m.stepN(10);
    expect(g.attacks).toBeGreaterThan(0);
    expect(mob.hp).toBeLessThan(mob.maxHp);
  });

  it('치명타 피해 강화: 배율 ×2 → Lv30 ×5 (GDD 7.1)', () => {
    const m = infinite(1);
    m.state.mods[0]!.critMulBp = 30 * 1000;
    expect(effectiveStats(rules, rules.towers.get('archer')!, m.state.mods[0]).critMulBp).toBe(50000);
  });

  it('초월: 등급 강화 3종이 모두 Lv50이면 열리고, 모든 타워 공격력 +5%/Lv, 비용은 표', () => {
    const m = arena(1);
    m.state.gold = 10_000_000;
    m.state.upgrades[0]![0] = 50;
    m.state.upgrades[0]![1] = 50;
    expect(transcendOpen(rules, m.state, 0)).toBe(false);
    m.state.upgrades[0]![2] = 50;
    expect(transcendOpen(rules, m.state, 0)).toBe(true);
    command(m, { type: 'upgrade', k: rules.transcendK });
    command(m, { type: 'upgrade', k: rules.transcendK });
    expect(upgradeLevel(m.state, 0, rules.transcendK)).toBe(2);
    expect(m.state.gold).toBe(10_000_000 - 50_000 - 57_500);
    expect(m.state.mods[0]?.atkPctBp).toBe(1000);
    // 히어로 타워 = 영웅 강화 50 × 10% + 초월 10%
    const t = placeTower(m.world, 'scholar', 0, 4, 0);
    const eff = effectiveStats(rules, rules.towers.get('scholar')!, m.state.mods[0], towerBonus(m.ctx, t, new Map()));
    expect(eff.atkMulBp).toBe(BP_ONE + 50_000 + 1000);
  });

  it('화면 맨 위 공속 배율: ×(1 + 공속%) — 한도(×5)까지', () => {
    expect(upgradeApsMulBp(rules, { apsPctBp: 0 })).toBe(10000);
    expect(upgradeApsMulBp(rules, { apsPctBp: 16000 })).toBe(26000);
    expect(upgradeApsMulBp(rules, { apsPctBp: 90000 })).toBe(50000);
  });
});

describe('한도 (M5-4: 공속 ×5·15회/초, 관통 90%, 치명 100%)', () => {
  it('공속 강화 50 (+200%) + 오라 +300% → 기본 1회/초 타워는 ×5 = 5회/초에서 멈춤', () => {
    const m = infinite(1);
    m.state.mods[0]!.apsPctBp = 50 * 400;
    const archer = rules.towers.get('archer')!;
    const plain = effectiveStats(rules, archer, m.state.mods[0]);
    expect(plain.apsMulBp).toBe(30000);
    expect(plain.apsCapped).toBe(false);
    const buffed = effectiveStats(rules, archer, m.state.mods[0], { atkPctBp: 0, apsPctBp: 30000, bossMulBp: BP_ONE });
    expect(buffed.apsMilli).toBe(archer.apsMilli * 5);
    expect(buffed.apsMulBp).toBe(50000);
    expect(buffed.apsCapped).toBe(true);
  });

  it('기본 3회/초(총잡이) + 공속 +200% → 9회/초, +400%면 15회/초 한도 (×5 = 15와 같음), 실제 공격 수도 초당 15 이하', () => {
    const gunner = rules.towers.get('gunner')!;
    expect(effectiveStats(rules, gunner, { ...infinite(1).state.mods[0]!, apsPctBp: 20000 }).apsMilli).toBe(gunner.apsMilli * 3);
    const capped = effectiveStats(rules, gunner, { ...infinite(1).state.mods[0]!, apsPctBp: 90000 });
    expect(capped.apsMilli).toBe(rules.apsMaxMilli);
    // 실제 판: 공속 최대 + 추가 보정 → 20초 동안 공격 300회 이하
    const m = arena(1);
    const mob = mobAt(m, 'slime', 3000);
    mob.hp = 1_000_000_000;
    mob.maxHp = mob.hp;
    const t = placeTower(m.world, 'goblin', 0, 4, 0); // 기본 2.5회/초 → ×5 = 12.5회/초
    m.state.mods[0]!.apsPctBp = 90000;
    m.stepN(400);
    expect(t.attacks).toBeLessThanOrEqual(12.5 * 20 + 1);
    expect(t.attacks).toBeGreaterThanOrEqual(12.5 * 20 - 1);
  });

  it('관통: 물리 관통 강화 30(60%) + 타워 관통 40%(저격수) → 90%에서 멈춤', () => {
    const m = infinite(1);
    m.state.mods[0]!.armorPenBp = 30 * 200;
    const sniper = rules.towers.get('sniper')!;
    const eff = effectiveStats(rules, sniper, m.state.mods[0]);
    expect(eff.armorPenBp).toBe(10000); // 합 (한도 전) — 맞을 때 표식까지 더해 자른다
    const caps = damageCaps(rules);
    const mob = { armor: 100, magicRes: 0, vulnBp: 0, markBp: 0, boss: false };
    // 방어 100 × (1 − 0.9) = 10 → 피해 × 100/110
    const d = damageAgainst({ p: 11000, m: 0, t: 0, armorPenBp: eff.armorPenBp }, mob as never, caps);
    expect(d.total).toBe(10000);
  });

  it('치명타 확률: 강화 30(+30%p) + 타워 80% → 100%에서 멈춤', () => {
    const m = infinite(1);
    m.state.mods[0]!.critChanceBp = 3000;
    const sniper = rules.towers.get('sniper')!;
    expect(effectiveStats(rules, sniper, m.state.mods[0]).critBp).toBe(sniper.critBp + 3000);
    m.state.mods[0]!.critChanceBp = 9000;
    expect(effectiveStats(rules, sniper, m.state.mods[0]).critBp).toBe(10000);
  });
});
