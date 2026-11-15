/**
 * M4-4 투명·감지: 드러나지 않은 투명 몹은 모든 피해·상태 이상 무효, 감지 오라 = 드러남(벗어나면 0.5초 유지),
 * 감지(자신) = 그 타워만, 경고 사건.
 * 시험장: 순환의 정원 진행도 3000 = 칸 (4, 1) 중심 (4500, 1500).
 */
import { describe, expect, it } from 'vitest';
import { isRevealedAt } from '../../src/sim/entities/Mob';
import { buildMatchRules } from '../../src/sim/rules';
import { insideAnyAura } from '../../src/sim/systems/Detection';
import { applyDot } from '../../src/sim/systems/Status';
import { placeTower } from '../../src/sim/systems/Summon';
import { spawnMob } from '../../src/sim/systems/Spawn';
import { arena, data, eventsOf, mobAt } from '../helpers/match';

const rules = buildMatchRules(data);

function thief(m: ReturnType<typeof arena>, progress: number, speed = 0) {
  const t = mobAt(m, 'thief', progress, speed);
  t.hp = t.maxHp = 1_000_000;
  t.armor = 0;
  t.magicRes = 0;
  return t;
}

describe('드러나지 않은 투명 몹 = 모든 피해·상태 이상 무효', () => {
  it('오라 밖 투명 몹에 광역 0 피해 (DEV_PLAN M4-4 완료 조건)', () => {
    const m = arena(1);
    const t = thief(m, 3000);
    placeTower(m.world, 'apprentice', 0, 4, 2); // 광역
    placeTower(m.world, 'cleaver', 0, 4, 0); // 근접 광역
    placeTower(m.world, 'archer', 0, 5, 2); // 단일
    m.stepN(400);
    expect(t.hp).toBe(1_000_000);
    expect(eventsOf(m, 'hit')).toHaveLength(0);
  });

  it('진흙 주술사·얼음 마법사의 상태 이상도, 걸려 있던 지속 피해도 들어가지 않는다', () => {
    const m = arena(1);
    const t = thief(m, 3000);
    applyDot(t, m.tick, 'flamemage', 'burn', 10_000, 60, 3);
    placeTower(m.world, 'mudshaman', 0, 4, 2);
    m.stepN(60);
    expect(t.hp).toBe(1_000_000);
    expect(t.slowBp).toBe(0);
  });
});

describe('감지 오라 (드러남, 벗어나면 0.5초 유지)', () => {
  it('정찰병 반경 3칸 안의 투명 몹은 드러나 모든 타워가 공격한다', () => {
    const m = arena(1);
    const t = thief(m, 3000);
    placeTower(m.world, 'scout', 0, 4, 4); // (4,1)과 3칸
    placeTower(m.world, 'archer', 0, 4, 2);
    m.stepN(40);
    expect(isRevealedAt(t, m.tick - 1)).toBe(true);
    expect(t.hp).toBeLessThan(1_000_000);
  });

  it('오라를 벗어난 마지막 틱 T 뒤 T+1~T+10틱은 드러나 있고 T+11틱에 다시 투명', () => {
    const m = arena(1);
    // 감지 오라 반경 3칸 = 3000. 정찰병 (2, 2) 중심 (2500, 2500), 몹은 (1,1)에서 오른쪽으로 2.4칸/초 → 진행도 약 3828에서 벗어남
    placeTower(m.world, 'scout', 0, 2, 2);
    const t = thief(m, 0, 2400);
    let lastInside = -1;
    let hiddenAgain = -1;
    for (let i = 0; i < 100; i++) {
      const tick = m.tick;
      m.step();
      if (t.revealedUntil === tick + 1 + rules.revealHoldTicks) lastInside = tick;
      if (lastInside >= 0 && hiddenAgain < 0 && !isRevealedAt(t, tick)) hiddenAgain = tick;
    }
    expect(rules.revealHoldTicks).toBe(10);
    expect(lastInside).toBe(30); // 틱 t 이동 뒤 진행도 = (t + 1) × 120: 틱 30 = 3720 (안), 틱 31 = 3840 > 3828 (밖)
    expect(hiddenAgain).toBe(lastInside + 11);
  });

  it('insideAnyAura: 경계 포함', () => {
    const auras = [{ tower: 1, owner: 0, x: 0, y: 0, r: 3000 }];
    expect(insideAnyAura(auras, 3000, 0)).toBe(true);
    expect(insideAnyAura(auras, 3001, 0)).toBe(false);
  });

  it('2인 판: 한 사람의 감지 오라가 두 사람 타워 모두에게 드러낸다', () => {
    const m = arena(1, { players: 2 });
    const t = thief(m, 3000);
    placeTower(m.world, 'scout', 0, 4, 4);
    placeTower(m.world, 'archer', 1, 4, 2);
    m.stepN(40);
    expect(t.hp).toBeLessThan(1_000_000);
  });
});

describe('감지(자신): 그 타워만 투명 몹을 공격', () => {
  it('저격수는 드러나지 않은 투명 몹을 치고, 옆의 궁수는 못 친다', () => {
    const m = arena(1);
    const t = thief(m, 3000);
    const sniper = placeTower(m.world, 'sniper', 0, 4, 2);
    const archer = placeTower(m.world, 'archer', 0, 4, 0);
    m.stepN(100);
    const hits = eventsOf(m, 'hit');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.source === sniper.id)).toBe(true);
    expect(hits.some((e) => e.source === archer.id)).toBe(false);
    expect(isRevealedAt(t, m.tick)).toBe(false);
  });
});

describe('투명 몹 경고 (판당 한 번, 감지 타워가 없을 때)', () => {
  it('감지 타워가 없으면 첫 투명 몹에 invisibleWarn, 두 번째부터는 없음', () => {
    const m = arena(1);
    m.state.stage = 35;
    spawnMob(m.ctx, m.world, 'thief');
    spawnMob(m.ctx, m.world, 'thief');
    expect(eventsOf(m, 'invisibleWarn')).toHaveLength(1);
    expect(m.state.invisibleWarned).toBe(true);
  });

  it('감지 타워(오라·자신)가 있으면 경고 없음 — 나중에 감지 없이 나오면 그때 한 번', () => {
    const m = arena(1);
    const s = placeTower(m.world, 'sniper', 0, 4, 2);
    spawnMob(m.ctx, m.world, 'thief');
    expect(eventsOf(m, 'invisibleWarn')).toHaveLength(0);
    m.world.entities.remove(s.id);
    spawnMob(m.ctx, m.world, 'thief');
    expect(eventsOf(m, 'invisibleWarn')).toHaveLength(1);
  });
});
