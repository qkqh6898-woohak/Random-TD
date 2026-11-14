/**
 * M3-10 타워 이동·교환 (GDD 4.5): 빈 배치 칸으로 이동, 타워 위면 교환, 무료·쿨타임 없음, 이동 후 0.5초(10틱) 공격 정지.
 */
import { describe, expect, it } from 'vitest';
import { validatePayload } from '../../src/sim/Commands';
import { towerAt } from '../../src/sim/entities/Tower';
import { tileCenter } from '../../src/sim/map';
import { buildMatchRules } from '../../src/sim/rules';
import { isPaused, moveCheck } from '../../src/sim/systems/Move';
import { placeTower } from '../../src/sim/systems/Summon';
import { addMob, command, data, infinite } from '../helpers/match';

const rules = buildMatchRules(data);

/** 순환의 정원의 경로 칸 하나 */
function pathCell(m: ReturnType<typeof infinite>): [number, number] {
  const i = m.map.kinds.indexOf('path');
  if (i < 0) throw new Error('경로 칸 없음');
  return [i % m.map.width, Math.floor(i / m.map.width)];
}

describe('이동·교환 (M3-10)', () => {
  it('데이터: 이동 후 공격 정지 0.5초 = 10틱', () => {
    expect(rules.movePauseTicks).toBe(10);
  });

  it('빈 배치 칸으로 이동: 칸·중심 좌표가 바뀌고 돈은 그대로, move 사건', () => {
    const m = infinite(1);
    const t = placeTower(m.world, 'archer', 0, 4, 0);
    const gold = m.state.gold;
    command(m, { type: 'move', fx: 4, fy: 0, tx: 6, ty: 0 });
    expect(towerAt(m.world, 4, 0)).toBeUndefined();
    expect(towerAt(m.world, 6, 0)?.id).toBe(t.id);
    expect({ x: t.x, y: t.y }).toEqual(tileCenter(6, 0));
    expect(m.state.gold).toBe(gold);
    expect(m.state.moves).toBe(1);
    expect(m.world.drainEvents().find((e) => e.type === 'move')).toMatchObject({ id: t.id, fx: 4, fy: 0, tx: 6, ty: 0, swap: 0 });
  });

  it('다른 타워 위에 놓으면 자리 교환 (둘 다 공격 정지)', () => {
    const m = infinite(2);
    const a = placeTower(m.world, 'archer', 0, 4, 0);
    const b = placeTower(m.world, 'goblin', 0, 6, 0);
    command(m, { type: 'move', fx: 4, fy: 0, tx: 6, ty: 0 });
    expect(towerAt(m.world, 6, 0)?.id).toBe(a.id);
    expect(towerAt(m.world, 4, 0)?.id).toBe(b.id);
    expect(isPaused(a, m.tick)).toBe(true);
    expect(isPaused(b, m.tick)).toBe(true);
    expect(m.world.drainEvents().find((e) => e.type === 'move')).toMatchObject({ swap: b.id });
  });

  it('쿨타임 없음: 연달아 옮길 수 있다', () => {
    const m = infinite(3);
    const t = placeTower(m.world, 'archer', 0, 4, 0);
    command(m, { type: 'move', fx: 4, fy: 0, tx: 5, ty: 0 });
    command(m, { type: 'move', fx: 5, fy: 0, tx: 6, ty: 0 });
    command(m, { type: 'move', fx: 6, fy: 0, tx: 4, ty: 0 });
    expect(towerAt(m.world, 4, 0)?.id).toBe(t.id);
    expect(m.state.moves).toBe(3);
  });

  it('못 가는 곳: 경로·장식 칸, 같은 칸, 빈 출발 칸, 남의 타워 (상태 그대로, moveFail)', () => {
    const m = infinite(4, { players: 2 });
    placeTower(m.world, 'archer', 0, 4, 0);
    placeTower(m.world, 'archer', 1, 6, 0);
    const [px, py] = pathCell(m);
    expect(moveCheck(m.ctx, m.world, 0, 4, 0, px, py)).toEqual({ ok: false, reason: 'notBuildable' });
    expect(moveCheck(m.ctx, m.world, 0, 4, 0, 4, 0)).toEqual({ ok: false, reason: 'same' });
    expect(moveCheck(m.ctx, m.world, 0, 5, 0, 6, 0)).toEqual({ ok: false, reason: 'noTower' });
    expect(moveCheck(m.ctx, m.world, 0, 4, 0, 6, 0)).toEqual({ ok: false, reason: 'otherOwner' });
    expect(moveCheck(m.ctx, m.world, 1, 4, 0, 5, 0)).toEqual({ ok: false, reason: 'notOwner' });
    command(m, { type: 'move', fx: 4, fy: 0, tx: px, ty: py });
    expect(towerAt(m.world, 4, 0)).toBeDefined();
    expect(m.state.moves).toBe(0);
    expect(m.world.drainEvents().find((e) => e.type === 'moveFail')).toMatchObject({ reason: 'notBuildable' });
  });

  it('이동한 틱 T부터 T+9까지 공격하지 않고 T+10에 바로 공격 (타이머는 1회분 보관)', () => {
    const m = infinite(5);
    m.state.stage = 1;
    m.state.nextStageTick = 1_000_000;
    m.state.spawnStage = 1;
    const mob = addMob(m, 'slime');
    mob.progress = 3000; // (4500, 1500) — (4, 0)·(5, 0) 모두 고블린 사거리 1.5 안
    mob.speed = 0;
    mob.hp = 1_000_000;
    const g = placeTower(m.world, 'goblin', 0, 4, 0);
    m.step(); // 준비분 1발
    expect(g.attacks).toBe(1);
    const T = m.tick;
    command(m, { type: 'move', fx: 4, fy: 0, tx: 5, ty: 0 });
    expect(g.pauseUntil).toBe(T + 10);
    const attacks = g.attacks;
    m.stepN(9); // 틱 T+1 ~ T+9
    expect(g.attacks).toBe(attacks);
    expect(m.tick).toBe(T + 10);
    m.step(); // 틱 T+10
    expect(g.attacks).toBe(attacks + 1);
  });

  it('날아가는 투사체는 타워가 옮겨져도 그대로 도착한다', () => {
    const m = infinite(6);
    m.state.stage = 1;
    m.state.nextStageTick = 1_000_000;
    m.state.spawnStage = 1;
    const mob = addMob(m, 'slime');
    mob.progress = 0; // (1500, 1500)
    mob.speed = 0;
    placeTower(m.world, 'archer', 0, 4, 0);
    m.step();
    command(m, { type: 'move', fx: 4, fy: 0, tx: 6, ty: 0 });
    m.stepN(6);
    expect(mob.hp).toBe(110);
  });

  it('명령 검사: 네 좌표 모두 0~255 정수', () => {
    expect(validatePayload({ type: 'move', fx: 0, fy: 1, tx: 2, ty: 3 })).toBeNull();
    expect(validatePayload({ type: 'move', fx: 0, fy: 1, tx: 2 })).toMatch(/ty/);
    expect(validatePayload({ type: 'move', fx: 0, fy: 1, tx: 2, ty: 3.5 })).toMatch(/ty/);
  });
});
