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

function runGame(seed: number, commands: CommandInput[], ticks: number): { hashes: number[]; final: number; executed: number } {
  const w = new World({ seed, players: 2, systems: [churn] });
  for (const c of commands) {
    const r = w.enqueue(c);
    if (!r.ok) throw new Error(r.reason);
  }
  const hashes: number[] = [];
  for (let t = 0; t < ticks; t++) {
    w.step();
    if (w.tick % 20 === 0) hashes.push(w.hash());
  }
  return { hashes, final: w.hash(), executed: w.executed.length };
}

const COMMANDS: CommandInput[] = [
  { type: 'noop', player: 1, tick: 30 },
  { type: 'noop', player: 0, tick: 30 },
  { type: 'noop', player: 0, tick: 400 },
  { type: 'noop', player: 1, tick: 1100 },
];

describe('헤드리스 결정성', () => {
  it('같은 시드 + 같은 명령 → 1초마다 해시가 모두 같다', () => {
    const a = runGame(2026, COMMANDS, 1200);
    const b = runGame(2026, [...COMMANDS].reverse(), 1200); // 넣는 순서가 달라도
    expect(a.hashes).toHaveLength(60);
    expect(b.hashes).toEqual(a.hashes);
    expect(b.final).toBe(a.final);
    expect(a.executed).toBe(4);
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
