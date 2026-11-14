import { describe, expect, it } from 'vitest';
import { CommandQueue, compareCommands, validateCommand, validatePayload, type Command, type CommandInput } from '../../src/sim/Commands';

/** 2인 판 (game.json maxPlayers = 2) */
const PLAYERS = 2;

function cmd(tick: number, player: number, seq: number): Command {
  return { type: 'noop', tick, player, seq };
}

describe('명령 정렬', () => {
  it('같은 틱 안에서는 (플레이어, seq) 순서', () => {
    const q = new CommandQueue(PLAYERS);
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
      const q = new CommandQueue(PLAYERS);
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
    const q = new CommandQueue(PLAYERS);
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
    const q = new CommandQueue(PLAYERS);
    const a = q.enqueue({ type: 'noop', player: 0 }, 10);
    const b = q.enqueue({ type: 'noop', player: 0 }, 10);
    const c = q.enqueue({ type: 'noop', player: 1 }, 10);
    expect(a.ok && a.command.seq).toBe(0);
    expect(b.ok && b.command.seq).toBe(1);
    expect(c.ok && c.command.seq).toBe(0);
    expect(a.ok && a.command.tick).toBe(10); // tick 생략 → 현재 틱
  });

  it('직접 준 seq 다음부터 자동 번호가 이어진다', () => {
    const q = new CommandQueue(PLAYERS);
    q.enqueue({ type: 'noop', seq: 7 }, 0);
    const r = q.enqueue({ type: 'noop' }, 0);
    expect(r.ok && r.command.seq).toBe(8);
    expect(q.peekNextSeq(0)).toBe(9);
  });

  it('지난 틱 명령은 거절', () => {
    const q = new CommandQueue(PLAYERS);
    const r = q.enqueue(cmd(4, 0, 0), 5);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('지난 틱');
  });

  it('대기 중인 (플레이어, seq) 중복은 거절', () => {
    const q = new CommandQueue(PLAYERS);
    expect(q.enqueue(cmd(1, 0, 3), 0).ok).toBe(true);
    const dup = q.enqueue(cmd(2, 0, 3), 0);
    expect(dup.ok).toBe(false);
    expect(!dup.ok && dup.reason).toContain('중복');
    expect(q.enqueue(cmd(2, 1, 3), 0).ok).toBe(true); // 다른 플레이어는 괜찮음
  });

  it('잘못된 명령은 이유와 함께 거절', () => {
    expect(validatePayload(null)).toContain('객체');
    expect(validatePayload({ type: 'fly' })).toContain('알 수 없는 명령');
    expect(validateCommand({ type: 'noop', tick: -1, player: 0, seq: 0 }, PLAYERS)).toContain('tick');
    expect(validateCommand({ type: 'noop', tick: 1.5, player: 0, seq: 0 }, PLAYERS)).toContain('tick');
    expect(validateCommand({ type: 'noop', tick: 0, player: PLAYERS, seq: 0 }, PLAYERS)).toContain('player');
    expect(validateCommand({ type: 'noop', tick: 0, player: 0, seq: -2 }, PLAYERS)).toContain('seq');
    expect(validateCommand(cmd(0, 0, 0), PLAYERS)).toBeNull();
    const q = new CommandQueue(PLAYERS);
    // @ts-expect-error 잘못된 종류
    expect(q.enqueue({ type: 'fly' }, 0).ok).toBe(false);
  });
});

describe('명령 검사: 플레이어 수는 판에서 받는다 (코드에 따로 박지 않음)', () => {
  it('validateCommand는 넘겨받은 플레이어 수까지만 허용', () => {
    expect(validateCommand(cmd(0, 1, 0), 2)).toBeNull();
    expect(validateCommand(cmd(0, 2, 0), 2)).toContain('player가 0~1');
    expect(validateCommand(cmd(0, 3, 0), 2)).toContain('player');
    expect(validateCommand(cmd(0, 1, 0), 1)).toContain('player가 0~0');
  });

  it('큐도 만들 때 받은 플레이어 수 밖의 명령을 거절', () => {
    const q = new CommandQueue(2);
    expect(q.players).toBe(2);
    expect(q.enqueue({ type: 'noop', player: 1 }, 0).ok).toBe(true);
    const r = q.enqueue({ type: 'noop', player: 2 }, 0);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('player');
    expect(q.size).toBe(1);
  });

  it('플레이어 수가 1 이상 정수가 아니면 큐를 만들 수 없다', () => {
    expect(() => new CommandQueue(0)).toThrow();
    expect(() => new CommandQueue(1.5)).toThrow();
  });
});

describe('닫힌 틱 (이미 take한 틱)', () => {
  it('take한 틱 이하로는 더 예약할 수 없다 → 받아 놓고 실행하지 않는 명령이 생기지 않는다', () => {
    const q = new CommandQueue(PLAYERS);
    q.take(4); // 틱 4 실행 중 (World.step 안)
    const late = q.enqueue(cmd(4, 0, 0), 4);
    expect(late.ok).toBe(false);
    expect(!late.ok && late.reason).toContain('이미 실행 중인 틱');
    expect(q.size).toBe(0);
    // tick 생략 → 다음 틱(5)으로 잡힌다
    const auto = q.enqueue({ type: 'noop' }, 4);
    expect(auto.ok && auto.command.tick).toBe(5);
    expect(q.earliestTick(4)).toBe(5);
    expect(q.take(5)).toHaveLength(1);
  });

  it('거절된 명령의 (플레이어, seq)는 대기 목록에 남지 않는다 (같은 seq를 다시 보낼 수 있다)', () => {
    const q = new CommandQueue(PLAYERS);
    q.take(0);
    expect(q.enqueue(cmd(0, 0, 0), 0).ok).toBe(false);
    expect(q.enqueue(cmd(1, 0, 0), 0).ok).toBe(true);
  });
});

describe('명령 객체 보호', () => {
  it('돌려받은 명령은 얼어 있어 고칠 수 없다 (큐 안 명령이 바뀌지 않는다)', () => {
    const q = new CommandQueue(PLAYERS);
    const r = q.enqueue({ type: 'noop', tick: 5 }, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.isFrozen(r.command)).toBe(true);
    expect(() => {
      (r.command as { tick: number }).tick = 1;
    }).toThrow(TypeError);
    expect(q.pending().map((c) => c.tick)).toEqual([5]);
    expect(q.take(5).map((c) => c.tick)).toEqual([5]);
  });

  it('넘긴 입력 객체를 나중에 고쳐도 예약된 명령은 그대로', () => {
    const q = new CommandQueue(PLAYERS);
    const input: { type: 'noop'; tick: number } = { type: 'noop', tick: 3 };
    q.enqueue(input, 0);
    input.tick = 9;
    expect(q.take(3)).toHaveLength(1);
  });

  it('모르는 필드는 거절 (네트워크로 받은 명령이 아무 내용이나 싣지 못하게)', () => {
    expect(validatePayload({ type: 'noop', junk: 1.5 })).toContain('모르는 필드: junk');
    expect(validateCommand({ type: 'noop', tick: 0, player: 0, seq: 0, extra: {} }, PLAYERS)).toContain('모르는 필드');
    expect(validatePayload([])).toContain('객체');
    const q = new CommandQueue(PLAYERS);
    const r = q.enqueue({ type: 'noop', tick: 5, junk: 1.5 } as unknown as CommandInput, 0);
    expect(r.ok).toBe(false);
    expect(q.size).toBe(0);
  });

  it('큐에 들어간 명령에는 허용한 필드만 있다', () => {
    const q = new CommandQueue(PLAYERS);
    const r = q.enqueue({ type: 'noop', tick: 2, player: 1, seq: 4 }, 0);
    expect(r.ok && Object.keys(r.command).sort()).toEqual(['player', 'seq', 'tick', 'type']);
  });
});
