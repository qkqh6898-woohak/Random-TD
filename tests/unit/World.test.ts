import { describe, expect, it } from 'vitest';
import { EntityStore, STREAM_WORLD, TICK_HZ, TICK_MS, TickClock, World, secondsToTicks, streamGamble, streamSummon, type Entity } from '../../src/sim/World';
import { Rng } from '../../src/sim/Rng';

describe('고정 틱', () => {
  it('20Hz, 1틱 = 50ms', () => {
    expect(TICK_HZ).toBe(20);
    expect(TICK_MS).toBe(50);
    expect(secondsToTicks(60)).toBe(1200);
  });

  it('step 1회 = 1틱, 게임 시간은 틱 × 50ms', () => {
    const w = new World({ seed: 1 });
    expect(w.tick).toBe(0);
    w.step();
    expect(w.tick).toBe(1);
    w.stepN(19);
    expect(w.tick).toBe(20);
    expect(w.elapsedMs).toBe(1000);
  });

  it('렌더 없이 시뮬레이션만 1만 틱 돌릴 수 있다', () => {
    const w = new World({ seed: 9 });
    w.stepN(10000);
    expect(w.tick).toBe(10000);
  });

  it('시스템은 등록 순서대로 매 틱 실행', () => {
    const order: string[] = [];
    const w = new World({
      seed: 1,
      systems: [(world) => order.push(`a${world.tick}`), (world) => order.push(`b${world.tick}`)],
    });
    w.addSystem((world) => order.push(`c${world.tick}`));
    w.stepN(2);
    expect(order).toEqual(['a0', 'b0', 'c0', 'a1', 'b1', 'c1']);
  });
});

describe('World 명령', () => {
  it('명령은 예약한 틱에 (플레이어, seq) 순서로 실행되고 기록된다', () => {
    const w = new World({ seed: 1, players: 2 });
    w.enqueue({ type: 'noop', player: 1, tick: 2 });
    w.enqueue({ type: 'noop', player: 0, tick: 2 });
    w.enqueue({ type: 'noop', player: 0, tick: 1 });
    w.enqueue({ type: 'noop', player: 1, tick: 2 });
    w.step(); // 틱 0
    expect(w.executed).toHaveLength(0);
    w.step(); // 틱 1
    // seq는 플레이어별로 넣은 순서대로 붙는다: P0 = (틱2 seq0, 틱1 seq1), P1 = (틱2 seq0, 틱2 seq1)
    expect(w.executed.map((c) => [c.tick, c.player, c.seq])).toEqual([[1, 0, 1]]);
    w.step(); // 틱 2
    expect(w.executed.map((c) => [c.tick, c.player, c.seq])).toEqual([
      [1, 0, 1],
      [2, 0, 0],
      [2, 1, 0],
      [2, 1, 1],
    ]);
  });

  it('tick 생략 시 다음 step에서 실행, 지난 틱은 거절', () => {
    const w = new World({ seed: 1 });
    w.stepN(5);
    const r = w.enqueue({ type: 'noop' });
    expect(r.ok && r.command.tick).toBe(5);
    expect(w.enqueue({ type: 'noop', tick: 4 }).ok).toBe(false);
    w.step();
    expect(w.executed).toHaveLength(1);
  });

  it('없는 플레이어 명령은 거절', () => {
    const w = new World({ seed: 1, players: 1 });
    expect(w.enqueue({ type: 'noop', player: 1 }).ok).toBe(false);
  });

  it('시드는 정수만 (소수 시드가 조용히 잘리지 않게)', () => {
    expect(() => new World({ seed: 1.5 })).toThrow();
    expect(() => new World({ seed: Number.NaN })).toThrow();
    expect(new World({ seed: -1 }).seed).toBe(0xffffffff);
  });

  it('플레이어 수는 1~2', () => {
    expect(() => new World({ seed: 1, players: 0 })).toThrow();
    expect(() => new World({ seed: 1, players: 3 })).toThrow();
  });
});

describe('World 난수 흐름', () => {
  it('세계·플레이어별 소환·도박 흐름이 있고 루트 시드에서 fork한 것과 같다', () => {
    const w = new World({ seed: 77, players: 2 });
    const root = new Rng(77);
    expect(w.rng(STREAM_WORLD).nextU32()).toBe(root.fork('world').nextU32());
    expect(w.rng(streamSummon(1)).nextU32()).toBe(root.fork('p1.summon').nextU32());
    expect(w.rng(streamGamble(0)).nextU32()).toBe(root.fork('p0.gamble').nextU32());
    expect(() => w.rng('p2.summon')).toThrow();
  });

  it('P1이 소환 난수를 써도 세계 난수는 그대로', () => {
    const a = new World({ seed: 5, players: 2 });
    const b = new World({ seed: 5, players: 2 });
    for (let i = 0; i < 100; i++) b.rng(streamSummon(0)).int(5);
    expect(a.rng(STREAM_WORLD).int(1000)).toBe(b.rng(STREAM_WORLD).int(1000));
  });
});

describe('World 사건과 엔티티', () => {
  it('emit한 사건은 drainEvents로 한 번만 가져간다 (여러 틱 누적)', () => {
    const w = new World({ seed: 1, systems: [(world) => world.emit('ping', { n: world.tick })] });
    w.stepN(3);
    const ev = w.drainEvents();
    expect(ev.map((e) => [e.type, e.n, e.tick])).toEqual([
      ['ping', 0, 0],
      ['ping', 1, 1],
      ['ping', 2, 2],
    ]);
    expect(w.drainEvents()).toHaveLength(0);
  });

  it('EntityStore는 항상 ID 순서로 돌려준다', () => {
    const store = new EntityStore<Entity>();
    store.insert({ id: 5, kind: 'mob' });
    store.insert({ id: 2, kind: 'mob' });
    const added = store.add({ kind: 'tower' });
    expect(added.id).toBe(6);
    store.insert({ id: 3, kind: 'mob' });
    expect(store.list().map((e) => e.id)).toEqual([2, 3, 5, 6]);
    expect(store.remove(3)).toBe(true);
    expect(store.remove(3)).toBe(false);
    expect(store.list().map((e) => e.id)).toEqual([2, 5, 6]);
    expect(() => store.insert({ id: 2, kind: 'x' })).toThrow();
    expect(store.size).toBe(3);
    expect(store.get(5)?.kind).toBe('mob');
  });
});

describe('World 해시', () => {
  it('같은 시드 + 같은 명령 → 같은 해시', () => {
    const run = (): number => {
      const w = new World({ seed: 1234, players: 2, systems: [(world) => void world.rng(STREAM_WORLD).int(100)] });
      w.enqueue({ type: 'noop', player: 1, tick: 3 });
      w.enqueue({ type: 'noop', player: 0, tick: 3 });
      w.stepN(100);
      return w.hash();
    };
    expect(run()).toBe(run());
  });

  it('시드나 틱이 다르면 해시가 다르다', () => {
    const a = new World({ seed: 1 });
    const b = new World({ seed: 2 });
    expect(a.hash()).not.toBe(b.hash());
    const c = new World({ seed: 1 });
    c.step();
    expect(a.hash()).not.toBe(c.hash());
  });

  it('난수를 쓰면 해시가 바뀐다 (난수 상태가 해시에 들어감)', () => {
    const a = new World({ seed: 1 });
    const before = a.hash();
    a.rng(STREAM_WORLD).nextU32();
    expect(a.hash()).not.toBe(before);
  });

  it('엔티티를 넣은 순서가 달라도 같은 상태면 같은 해시', () => {
    const a = new World({ seed: 3 });
    const b = new World({ seed: 3 });
    a.entities.insert({ id: 1, kind: 'mob', hp: 10 });
    a.entities.insert({ id: 2, kind: 'tower', grade: 'normal' });
    b.entities.insert({ id: 2, kind: 'tower', grade: 'normal' });
    b.entities.insert({ id: 1, kind: 'mob', hp: 10 });
    expect(a.hash()).toBe(b.hash());
    b.entities.get(1)!.hp = 9;
    expect(a.hash()).not.toBe(b.hash());
  });

  it('대기 중인 미래 명령은 해시에 들어가지 않는다 (확정 상태만)', () => {
    const a = new World({ seed: 3 });
    const b = new World({ seed: 3 });
    b.enqueue({ type: 'noop', tick: 50 });
    expect(a.hash()).toBe(b.hash());
  });
});

describe('TickClock (누적 시간 방식 + 배속)', () => {
  const runFrames = (clock: TickClock, frames: number, frameMs: number): number => {
    let ticks = 0;
    for (let i = 0; i < frames; i++) ticks += clock.advance(frameMs);
    return ticks;
  };

  it('×1: 60fps로 1초 → 20틱', () => {
    expect(runFrames(new TickClock({ speed: 1 }), 60, 1000 / 60)).toBe(20);
  });

  it('×2에서 틱이 2배 빨리 돈다, ×3은 3배', () => {
    const x1 = runFrames(new TickClock({ speed: 1 }), 600, 1000 / 60);
    const x2 = runFrames(new TickClock({ speed: 2 }), 600, 1000 / 60);
    const x3 = runFrames(new TickClock({ speed: 3 }), 600, 1000 / 60);
    expect(x1).toBe(200);
    expect(x2).toBe(400);
    expect(x3).toBe(600);
  });

  it('프레임 간격이 들쭉날쭉해도 남는 시간이 다음 프레임으로 이어진다', () => {
    const clock = new TickClock();
    const deltas = [10, 30, 7, 53, 20, 80, 1, 49, 50]; // 합 300ms
    expect(deltas.reduce((s, d) => s + clock.advance(d), 0)).toBe(6);
    expect(clock.alpha).toBe(0);
  });

  it('30fps 저사양에서도 1초 = 20틱', () => {
    expect(runFrames(new TickClock(), 30, 1000 / 30)).toBe(20);
  });

  it('배속 0 = 일시정지, 음수·NaN 시간은 무시', () => {
    const clock = new TickClock({ speed: 0 });
    expect(clock.advance(1000)).toBe(0);
    clock.speed = 1;
    expect(clock.advance(-5)).toBe(0);
    expect(clock.advance(Number.NaN)).toBe(0);
    expect(clock.advance(50)).toBe(1);
  });

  it('한 프레임이 너무 길면 maxFrameMs까지만 따라잡는다', () => {
    const clock = new TickClock({ speed: 2, maxFrameMs: 250 });
    expect(clock.advance(10000)).toBe(10); // 250ms × 2 / 50ms
  });

  it('alpha는 0 이상 1 미만 (렌더 보간용)', () => {
    const clock = new TickClock();
    clock.advance(75);
    expect(clock.alpha).toBeCloseTo(0.5);
    clock.reset();
    expect(clock.alpha).toBe(0);
  });

  it('잘못된 배속은 거부', () => {
    expect(() => new TickClock({ speed: 1.5 })).toThrow();
    const c = new TickClock();
    expect(() => {
      c.speed = -1;
    }).toThrow();
  });

  it('World와 함께: ×2로 같은 실제 시간이면 World 틱이 2배', () => {
    const w1 = new World({ seed: 1 });
    const w2 = new World({ seed: 1 });
    const c1 = new TickClock({ speed: 1 });
    const c2 = new TickClock({ speed: 2 });
    for (let i = 0; i < 120; i++) {
      w1.stepN(c1.advance(1000 / 60));
      w2.stepN(c2.advance(1000 / 60));
    }
    expect(w1.tick).toBe(40);
    expect(w2.tick).toBe(80);
  });
});
