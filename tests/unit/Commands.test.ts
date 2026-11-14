import { describe, expect, it } from 'vitest';
import { CommandQueue, MAX_PLAYERS, compareCommands, validateCommand, validatePayload, type Command } from '../../src/sim/Commands';

function cmd(tick: number, player: number, seq: number): Command {
  return { type: 'noop', tick, player, seq };
}

describe('명령 정렬', () => {
  it('같은 틱 안에서는 (플레이어, seq) 순서', () => {
    const q = new CommandQueue();
    // 일부러 뒤섞어 넣는다
    const inputs = [cmd(5, 1, 0), cmd(5, 0, 2), cmd(5, 1, 1), cmd(5, 0, 0), cmd(5, 0, 1)];
    for (const c of inputs) expect(q.enqueue(c, 0).ok).toBe(true);
    const out = q.take(5).map((c) => [c.player, c.seq]);
    expect(out).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ]);
  });

  it('넣은 순서가 달라도 결과 순서는 같다', () => {
    const base = [cmd(3, 0, 0), cmd(3, 1, 0), cmd(3, 0, 1), cmd(3, 1, 1)];
    const orders = [base, [...base].reverse(), [base[2], base[0], base[3], base[1]] as Command[]];
    const results = orders.map((list) => {
      const q = new CommandQueue();
      list.forEach((c) => q.enqueue(c, 0));
      return q.take(3);
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it('compareCommands: 틱 → 플레이어 → seq', () => {
    const list = [cmd(2, 0, 0), cmd(1, 1, 5), cmd(1, 0, 9), cmd(1, 1, 4)].sort(compareCommands);
    expect(list.map((c) => `${c.tick}/${c.player}/${c.seq}`)).toEqual(['1/0/9', '1/1/4', '1/1/5', '2/0/0']);
  });

  it('take는 그 틱 명령만 꺼내고 큐에서 지운다', () => {
    const q = new CommandQueue();
    q.enqueue(cmd(1, 0, 0), 0);
    q.enqueue(cmd(2, 0, 1), 0);
    expect(q.size).toBe(2);
    expect(q.take(1)).toHaveLength(1);
    expect(q.take(1)).toHaveLength(0);
    expect(q.size).toBe(1);
    expect(q.pending().map((c) => c.tick)).toEqual([2]);
  });
});

describe('명령 예약 규칙', () => {
  it('seq를 비우면 플레이어별로 0부터 자동 증가', () => {
    const q = new CommandQueue();
    const a = q.enqueue({ type: 'noop', player: 0 }, 10);
    const b = q.enqueue({ type: 'noop', player: 0 }, 10);
    const c = q.enqueue({ type: 'noop', player: 1 }, 10);
    expect(a.ok && a.command.seq).toBe(0);
    expect(b.ok && b.command.seq).toBe(1);
    expect(c.ok && c.command.seq).toBe(0);
    expect(a.ok && a.command.tick).toBe(10); // tick 생략 → 현재 틱
  });

  it('직접 준 seq 다음부터 자동 번호가 이어진다', () => {
    const q = new CommandQueue();
    q.enqueue({ type: 'noop', seq: 7 }, 0);
    const r = q.enqueue({ type: 'noop' }, 0);
    expect(r.ok && r.command.seq).toBe(8);
    expect(q.peekNextSeq(0)).toBe(9);
  });

  it('지난 틱 명령은 거절', () => {
    const q = new CommandQueue();
    const r = q.enqueue(cmd(4, 0, 0), 5);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('지난 틱');
  });

  it('대기 중인 (플레이어, seq) 중복은 거절', () => {
    const q = new CommandQueue();
    expect(q.enqueue(cmd(1, 0, 3), 0).ok).toBe(true);
    const dup = q.enqueue(cmd(2, 0, 3), 0);
    expect(dup.ok).toBe(false);
    expect(!dup.ok && dup.reason).toContain('중복');
    expect(q.enqueue(cmd(2, 1, 3), 0).ok).toBe(true); // 다른 플레이어는 괜찮음
  });

  it('잘못된 명령은 이유와 함께 거절', () => {
    expect(validatePayload(null)).toContain('객체');
    expect(validatePayload({ type: 'fly' })).toContain('알 수 없는 명령');
    expect(validateCommand({ type: 'noop', tick: -1, player: 0, seq: 0 })).toContain('tick');
    expect(validateCommand({ type: 'noop', tick: 1.5, player: 0, seq: 0 })).toContain('tick');
    expect(validateCommand({ type: 'noop', tick: 0, player: MAX_PLAYERS, seq: 0 })).toContain('player');
    expect(validateCommand({ type: 'noop', tick: 0, player: 0, seq: -2 })).toContain('seq');
    expect(validateCommand(cmd(0, 0, 0))).toBeNull();
    const q = new CommandQueue();
    // @ts-expect-error 잘못된 종류
    expect(q.enqueue({ type: 'fly' }, 0).ok).toBe(false);
  });
});
