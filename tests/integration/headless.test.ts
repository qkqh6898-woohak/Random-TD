/**
 * 헤드리스 결정성 통합 테스트 (MULTIPLAYER.md 6장: "렌더 없이 시뮬레이션만 돌리는 테스트",
 * "같은 시드·같은 명령 → 같은 결과").
 *
 * 2인 판을 60초(1200틱) 돌리면서 1초마다 해시를 기록하고, 같은 시드·같은 명령 기록으로 다시 돌려 해시 흐름이 같은지 본다.
 */
import { describe, expect, it } from 'vitest';
import { STREAM_WORLD, World, streamSummon, type System } from '../../src/sim/World';
import type { CommandInput } from '../../src/sim/Commands';

/** 테스트용 시스템: 난수로 엔티티를 만들고 지우며 상태를 바꾼다. */
const churn: System = (world) => {
  const r = world.rng(STREAM_WORLD);
  if (world.tick % 25 === 0) world.entities.add({ kind: 'mob', hp: 100 + r.int(50), x: r.int(9000) });
  for (const e of world.entities.list()) {
    if (e.kind === 'mob') {
      e.hp = (e.hp as number) - 1 - r.int(3);
      if ((e.hp as number) <= 0) world.entities.remove(e.id);
    }
  }
  for (let p = 0; p < world.players; p++) {
    if (world.tick % 40 === p * 20) world.entities.add({ kind: 'tower', owner: p, roll: world.rng(streamSummon(p)).int(5) });
  }
};

interface RunResult {
  hashes: number[];
  final: number;
  /** 실행된 명령 (틱/플레이어/seq) 순서 그대로 */
  executed: string[];
}

function runGame(seed: number, commands: CommandInput[], ticks: number): RunResult {
  const w = new World({ seed, players: 2, maxPlayers: 2, systems: [churn] });
  for (const c of commands) {
    const r = w.enqueue(c);
    if (!r.ok) throw new Error(r.reason);
  }
  const hashes: number[] = [];
  for (let t = 0; t < ticks; t++) {
    w.step();
    if (w.tick % 20 === 0) hashes.push(w.hash());
  }
  return { hashes, final: w.hash(), executed: w.executed.map((c) => `${c.tick}/${c.player}/${c.seq}`) };
}

/**
 * seq를 직접 적는다: 자동 번호에 맡기면 넣는 순서를 바꿀 때 명령 자체(seq)가 달라져
 * '넣는 순서가 달라도 같은 결과'를 검증하지 못한다. 같은 틱에 같은 플레이어 명령 2개를 두어 seq 정렬도 확인한다.
 */
const COMMANDS: CommandInput[] = [
  { type: 'noop', player: 1, tick: 30, seq: 0 },
  { type: 'noop', player: 0, tick: 30, seq: 1 },
  { type: 'noop', player: 0, tick: 30, seq: 0 },
  { type: 'noop', player: 0, tick: 400, seq: 2 },
  { type: 'noop', player: 1, tick: 1100, seq: 1 },
];

/** 정렬 규칙(틱 → 플레이어 → seq)대로라면 이 순서로 실행된다. */
const EXPECTED_ORDER = ['30/0/0', '30/0/1', '30/1/0', '400/0/2', '1100/1/1'];

describe('헤드리스 결정성', () => {
  it('같은 시드 + 같은 명령 → 1초마다 해시가 모두 같다', () => {
    const a = runGame(2026, COMMANDS, 1200);
    const b = runGame(2026, [...COMMANDS].reverse(), 1200); // 넣는 순서가 달라도
    expect(a.hashes).toHaveLength(60);
    expect(b.hashes).toEqual(a.hashes);
    expect(b.final).toBe(a.final);
  });

  it('넣는 순서가 달라도 실행 순서(틱 → 플레이어 → seq)가 같다', () => {
    const orders = [COMMANDS, [...COMMANDS].reverse(), [2, 4, 0, 3, 1].map((i) => COMMANDS[i] as CommandInput)];
    for (const order of orders) expect(runGame(2026, order, 1200).executed).toEqual(EXPECTED_ORDER);
  });

  it('시드가 다르면 해시 흐름이 갈린다', () => {
    const a = runGame(1, COMMANDS, 400);
    const b = runGame(2, COMMANDS, 400);
    expect(a.final).not.toBe(b.final);
  });

  it('1200틱 시뮬레이션이 충분히 빠르다 (헤드리스 밸런스 시뮬레이터의 기반)', () => {
    const start = Date.now();
    runGame(7, COMMANDS, 1200);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
