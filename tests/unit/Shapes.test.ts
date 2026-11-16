/**
 * M3-5 공격 형태 (GDD 5.2): 광역 r · 근접 광역 · 관통 n · 연쇄 n(−20%) · 다중 n · 전체 — 형태별 맞는 몹 수.
 * 순수 함수(Shapes) + 판 안에서 실제 타워가 몇 마리를 맞히는지.
 */
import { describe, expect, it } from 'vitest';
import type { Mob } from '../../src/sim/entities/Mob';
import { listProjectiles } from '../../src/sim/entities/Projectile';
import { positionAt } from '../../src/sim/map';
import { buildMatchRules } from '../../src/sim/rules';
import { aoeTargets, chainTargets, globalTargets, meleeAoeTargets, pierceTargets } from '../../src/sim/systems/Shapes';
import { placeTower } from '../../src/sim/systems/Summon';
import type { TargetCandidate } from '../../src/sim/systems/Targeting';
import { addMob, campaign, data, infinite } from '../helpers/match';

const rules = buildMatchRules(data);
const c = (id: number, x: number, y: number, alive = true): TargetCandidate => ({ id, x, y, progress: 0, alive });

describe('데이터 → 형태 값', () => {
  it('광역 반경(칸 → 단위)과 관통·연쇄·다중 마리 수', () => {
    expect(rules.towers.get('apprentice')).toMatchObject({ shape: 'aoe', radius: 800, count: 1 });
    expect(rules.towers.get('cleaver')).toMatchObject({ shape: 'melee_aoe', radius: 1200 });
    expect(rules.towers.get('spearman')).toMatchObject({ shape: 'pierce', count: 2, radius: 0 });
    expect(rules.towers.get('lightning')).toMatchObject({ shape: 'chain', count: 3 });
    expect(rules.towers.get('ninja')).toMatchObject({ shape: 'multi', count: 3 });
    expect(rules.towers.get('ruin')).toMatchObject({ shape: 'global', instant: true });
    expect(rules.towers.get('archer')).toMatchObject({ shape: 'single', radius: 0, count: 1 });
    expect(rules.chainRange).toBe(2000);
    expect(rules.pierceHalfWidth).toBe(500);
  });
});

describe('순수 함수', () => {
  it('광역: 중심 반경 r 안 (경계 포함), 죽은 몹 제외, ID 순', () => {
    const list = [c(1, 0, 0), c(2, 800, 0), c(3, 801, 0), c(4, 0, -500), c(5, 100, 100, false)];
    expect(aoeTargets(list, 0, 0, 800).map((t) => t.id)).toEqual([1, 2, 4]);
  });

  it('근접 광역: 타워 중심 반경 r + 고른 대상 (반경보다 사거리가 길어도 대상은 맞는다)', () => {
    const list = [c(1, 1400, 0), c(2, 1000, 0), c(3, 0, 1300)];
    expect(meleeAoeTargets(list, 0, 0, 1200, list[0]!).map((t) => t.id)).toEqual([1, 2]);
  });

  it('관통: 직선 위(폭 ±0.5칸)를 타워에서 가까운 순서로 n마리, 뒤쪽·옆으로 먼 몹은 빠짐', () => {
    const list = [c(1, 3000, 0), c(2, 1000, 400), c(3, 2000, -500), c(4, 1500, 900), c(5, -500, 0), c(6, 3600, 0)];
    expect(pierceTargets(list, 0, 0, 3000, 0, 3500, 500, 3).map((t) => t.id)).toEqual([2, 3, 1]);
    expect(pierceTargets(list, 0, 0, 3000, 0, 3500, 500, 2).map((t) => t.id)).toEqual([2, 3]);
    // 길이 밖(3600)은 빠짐
    expect(pierceTargets(list, 0, 0, 3000, 0, 3500, 500, 9).map((t) => t.id)).toEqual([2, 3, 1]);
    // 대각선 방향도 정수로: (0,0) → (3000, 3000), (1000, 1000)·(2000, 2100)은 직선 위
    const diag = [c(1, 1000, 1000), c(2, 2000, 2100), c(3, 2000, 1000)];
    expect(pierceTargets(diag, 0, 0, 3000, 3000, 5000, 500, 5).map((t) => t.id)).toEqual([1, 2]);
  });

  it('연쇄: 대상 → 가장 가까운 안 맞은 몹(반경 2칸)으로 튕기며 n마리, 더 없으면 멈춤', () => {
    const list = [c(1, 0, 0), c(2, 1500, 0), c(3, 1000, 0), c(4, 3000, 0), c(5, 6000, 0)];
    // 1 → 3(1000) → 2(500) → 4(1500) … 5는 3000 떨어져 반경 밖
    expect(chainTargets(list, list[0]!, 3, 2000).map((t) => t.id)).toEqual([1, 3, 2]);
    expect(chainTargets(list, list[0]!, 9, 2000).map((t) => t.id)).toEqual([1, 3, 2, 4]);
    // 같은 거리면 ID가 작은 쪽 (후보는 ID 순)
    const tie = [c(1, 0, 0), c(3, -1000, 0), c(7, 1000, 0)];
    expect(chainTargets(tie, tie[0]!, 2, 2000).map((t) => t.id)).toEqual([1, 3]);
  });

  it('전체: 살아 있는 모든 후보', () => {
    expect(globalTargets([c(1, 0, 0), c(2, 99_000, 0, false), c(3, 50_000, 50_000)]).map((t) => t.id)).toEqual([1, 3]);
  });
});

/** 순환의 정원 1단계 판: 진행도 progs에 몹을 세워 둔다 (속도 0, 체력 넉넉히). */
function board(progs: number[], mobId = 'slime') {
  const m = infinite(3);
  m.state.stage = 1;
  m.state.nextStageTick = 1_000_000;
  m.state.spawnStage = 1;
  const mobs = progs.map((p) => {
    const mob = addMob(m, mobId);
    mob.progress = p;
    mob.speed = 0;
    mob.hp = 1_000_000;
    mob.maxHp = 1_000_000;
    return mob;
  });
  return { m, mobs };
}

/** 그 타워의 첫 공격이 몇 마리를 맞혔는지 (투사체가 도착할 때까지 돌린다). */
function firstVolley(m: ReturnType<typeof infinite>, towerId: string, tx: number, ty: number): number[] {
  const t = placeTower(m.world, towerId, 0, tx, ty);
  const hitIds: number[] = [];
  for (let i = 0; i < 40; i++) {
    m.step();
    for (const e of m.world.drainEvents()) if (e.type === 'hit' && e.source === t.id) hitIds.push(Number(e.target));
    if (t.attacks >= 1 && listProjectiles(m.world).length === 0 && hitIds.length > 0) break;
  }
  return hitIds;
}

function hpLost(mobs: Mob[]): number[] {
  return mobs.map((x) => 1_000_000 - x.hp);
}

describe('판 안에서 형태별 맞는 몹 수', () => {
  // 순환의 정원 위쪽 줄: 진행도 0 = (1500, 1500), 1000마다 오른쪽으로 1칸 (y = 1500)
  it('단일(궁수): 몹 3마리가 붙어 있어도 1마리', () => {
    const { m } = board([3000, 3200, 3400]);
    expect(firstVolley(m, 'archer', 4, 0)).toHaveLength(1);
  });

  it('광역 r0.8(견습 마법사): 대상 지점 반경 0.8칸 안 3마리만 (1칸 떨어진 몹은 빠짐)', () => {
    const { m, mobs } = board([3000, 3300, 3700, 4900]);
    const ids = firstVolley(m, 'apprentice', 4, 0);
    expect(ids.sort()).toEqual([mobs[0]!.id, mobs[1]!.id, mobs[2]!.id].sort());
  });

  it('근접 광역 r1.2(광역딜 전사): 타워 중심 1.2칸 안 몹 모두 즉시', () => {
    // 타워 (4, 0) 중심 (4500, 500). 몹 진행도 3000 = (4500,1500) 거리 1000, 3600 = (5100,1500) 거리 1166, 4000 = (5500, 1500) 거리 1414
    const { m, mobs } = board([3000, 3600, 4000]);
    const ids = firstVolley(m, 'cleaver', 4, 0);
    expect(ids.sort()).toEqual([mobs[0]!.id, mobs[1]!.id].sort());
    expect(listProjectiles(m.world)).toHaveLength(0);
  });

  it('관통 2(창병): 직선 위 몹 3마리 중 가까운 2마리', () => {
    // 타워 (4, 0) 중심 (4500, 500), 몹이 (4500, 1500)에 3마리 겹침 → 직선 위 3마리, 가까운 순(같으면 ID) 2마리
    const { m, mobs } = board([3000, 3000, 3000]);
    const ids = firstVolley(m, 'spearman', 4, 0);
    expect(ids).toEqual([mobs[0]!.id, mobs[1]!.id]);
  });

  it('연쇄 3(번개 마법사): 3마리, 두 번째 −20%, 세 번째 −36% (마법 103.5, 소수 나머지 누적)', () => {
    const { m, mobs } = board([3000, 4000, 5000, 6000]);
    const ids = firstVolley(m, 'lightning', 4, 0);
    expect(ids).toEqual([mobs[0]!.id, mobs[1]!.id, mobs[2]!.id]);
    expect(hpLost(mobs)).toEqual([103, 83, 66, 0]); // 6900 → 5520 → 4416
  });

  it('다중 3(표창 닌자): 서로 다른 3마리에게 투사체 3개', () => {
    const { m, mobs } = board([2000, 3000, 4000, 5000]);
    const t = placeTower(m.world, 'ninja', 0, 4, 0);
    m.step();
    expect(listProjectiles(m.world).filter((p) => p.source === t.id)).toHaveLength(3);
    const targets = new Set(listProjectiles(m.world).map((p) => p.target));
    expect(targets.size).toBe(3);
    m.stepN(10);
    expect(hpLost(mobs).filter((x) => x > 0)).toHaveLength(3);
  });

  it('다중: 사거리 안 몹이 n보다 적으면 있는 만큼만', () => {
    const { m } = board([3000]);
    const t = placeTower(m.world, 'stormarcher', 0, 4, 0);
    m.step();
    expect(listProjectiles(m.world).filter((p) => p.source === t.id)).toHaveLength(1);
  });

  it('전체(파멸의 신): 맵 위 모든 드러난 몹, 투명 몹은 빠짐', () => {
    const m = infinite(4);
    m.state.stage = 35;
    m.state.nextStageTick = 1_000_000;
    m.state.spawnStage = 35;
    const ms = [2000, 9000, 15_000, 22_000].map((p) => {
      const x = addMob(m, 'slime');
      x.progress = p;
      x.speed = 0;
      x.hp = 1e9;
      return x;
    });
    const thief = addMob(m, 'thief');
    thief.progress = 5000;
    thief.speed = 0;
    const ids = firstVolley(m, 'ruin', 0, 0);
    expect(ids.sort()).toEqual(ms.map((x) => x.id).sort());
    expect(thief.hp).toBe(thief.maxHp);
  });

  it('광역 폭발은 투명 몹에게 들어가지 않는다 (GDD 5.7)', () => {
    const m = infinite(6);
    m.state.stage = 35;
    m.state.nextStageTick = 1_000_000;
    m.state.spawnStage = 35;
    const slime = addMob(m, 'slime');
    slime.progress = 3000;
    slime.speed = 0;
    slime.hp = 1e9;
    const thief = addMob(m, 'thief');
    thief.progress = 3100;
    thief.speed = 0;
    firstVolley(m, 'apprentice', 4, 0);
    expect(thief.hp).toBe(thief.maxHp);
  });

  it('광역 투사체가 날아가는 중 대상이 죽으면 헛발 (폭발 없음)', () => {
    const { m, mobs } = board([0, 300]);
    placeTower(m.world, 'apprentice', 0, 2, 0); // (2500, 500) → (1500,1500) 거리 1414: 2틱 비행
    m.step();
    expect(listProjectiles(m.world)).toHaveLength(1);
    m.world.entities.remove(mobs[0]!.id);
    m.step();
    expect(listProjectiles(m.world)).toHaveLength(0);
    expect(mobs[1]!.hp).toBe(1_000_000);
    expect(m.world.drainEvents().some((e) => e.type === 'miss')).toBe(true);
  });

  it('캠페인 맵에서도 광역이 경로 위 몹을 반경으로 맞힌다 (위치 = 진행도 → 좌표)', () => {
    const m = campaign(1);
    m.state.stage = 1;
    m.state.nextStageTick = 1_000_000;
    m.state.spawnStage = 1;
    const a = addMob(m, 'slime');
    const b = addMob(m, 'slime');
    a.progress = 5000;
    b.progress = 5400;
    a.speed = 0;
    b.speed = 0;
    a.hp = 1e9;
    b.hp = 1e9;
    const pa = positionAt(m.map.path, 5000);
    const tx = Math.floor(pa.x / 1000);
    const ty = Math.floor(pa.y / 1000);
    const spot = m.map.buildable.find(([x, y]) => Math.abs(x - tx) + Math.abs(y - ty) === 1);
    expect(spot).toBeDefined();
    const ids = firstVolley(m, 'apprentice', spot![0], spot![1]);
    expect(ids.sort()).toEqual([a.id, b.id].sort());
  });
});
