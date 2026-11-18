/**
 * 피드백 #26 — 맵 오른쪽 위 버튼 하나로 모두 승급 (mergeAllStacks 명령).
 * 이슈에 판 기록 JSON이 없어 리플레이 재현 대신 규칙 테스트 + 리플레이 왕복(결정성)으로 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { validatePayload } from '../../src/sim/Commands';
import { listTowers, type Tower } from '../../src/sim/entities/Tower';
import type { Match } from '../../src/sim/match';
import { placeTower } from '../../src/sim/systems/Summon';
import { fullStacks } from '../../src/sim/systems/Merge';
import { playReplay, recordReplay, replayToJson } from '../../src/sim/replay';
import { mergeAllButton, mergeAllText } from '../../src/ui/messages';
import { arena, arenaData, command, infinite } from '../helpers/match';

function stack(m: Match, id: string, x: number, y: number, n: number, owner = 0): Tower[] {
  const out: Tower[] = [];
  for (let i = 0; i < n; i++) out.push(placeTower(m.world, id, owner, x, y));
  return out;
}

describe('피드백 #26 모두 승급 (mergeAllStacks)', () => {
  it('명령 내용 검사: 내용 필드 없음', () => {
    expect(validatePayload({ type: 'mergeAllStacks' })).toBeNull();
    expect(validatePayload({ type: 'mergeAllStacks', x: 1 })).not.toBeNull();
  });

  it('승급할 수 있는 무더기를 남김없이 승급 (서로 다른 타워 여러 무더기 + 연쇄 결과까지)', () => {
    const m = arena(26);
    const pads = m.map.buildable;
    stack(m, 'goblin', pads[0]![0], pads[0]![1], 3);
    stack(m, 'goblin', pads[1]![0], pads[1]![1], 3);
    stack(m, 'archer', pads[2]![0], pads[2]![1], 3);
    stack(m, 'archer', pads[3]![0], pads[3]![1], 2); // 덜 찬 무더기는 그대로
    const before = m.state.merges;
    command(m, { type: 'mergeAllStacks' });
    const evs = m.world.drainEvents();
    const merges = evs.filter((e) => e.type === 'merge');
    expect(merges.length).toBeGreaterThanOrEqual(3);
    expect(m.state.merges - before).toBe(merges.length);
    expect(merges.filter((e) => e.fromTower === 'goblin')).toHaveLength(2);
    expect(merges.filter((e) => e.fromTower === 'archer')).toHaveLength(1);
    // 끝나면 승급할 수 있는 무더기가 남지 않는다
    expect(fullStacks(m.ctx, m.world, 0)).toHaveLength(0);
    expect(evs.find((e) => e.type === 'mergeAllStacks')).toMatchObject({ player: 0, steps: merges.length });
    expect(evs.filter((e) => e.type === 'mergeChain')).toHaveLength(0);
  });

  it('한 무더기의 연쇄 상한(merge.chainMax)을 넘어도 모두 승급은 끝까지 한다', () => {
    const m = arena(27);
    const pads = m.map.buildable;
    for (let i = 0; i < 15; i++) stack(m, 'goblin', pads[i]![0], pads[i]![1], 3);
    command(m, { type: 'mergeAllStacks' });
    const merges = m.world.drainEvents().filter((e) => e.type === 'merge');
    expect(merges.length).toBeGreaterThan(m.rules.mergeChainMax);
    expect(fullStacks(m.ctx, m.world, 0)).toHaveLength(0);
  });

  it('남의 무더기는 건드리지 않고, 승급할 것이 없으면 상태를 안 바꾸고 mergeFail none', () => {
    const m = arena(28, { players: 2 });
    const pads = m.map.buildable;
    stack(m, 'goblin', pads[0]![0], pads[0]![1], 3, 1);
    stack(m, 'fortuna', pads[1]![0], pads[1]![1], 3); // 레전드는 승급 불가
    const towers = listTowers(m.world).length;
    m.world.drainEvents();
    command(m, { type: 'mergeAllStacks' });
    const evs = m.world.drainEvents();
    expect(evs.filter((e) => e.type === 'merge')).toHaveLength(0);
    expect(evs.find((e) => e.type === 'mergeFail')).toMatchObject({ player: 0, reason: 'none' });
    expect(listTowers(m.world)).toHaveLength(towers);
    expect(fullStacks(m.ctx, m.world, 1)).toHaveLength(1);
  });

  it('리플레이 왕복 = 같은 해시 (명령만으로 만든 판)', () => {
    const m = infinite(30, { debug: true });
    command(m, { type: 'debugAddGold', amount: 500_000 });
    for (let i = 0; i < 18; i++) command(m, { type: 'summonAuto' });
    command(m, { type: 'mergeAllStacks' });
    expect(fullStacks(m.ctx, m.world, 0)).toHaveLength(0);
    m.stepN(100);
    const file = recordReplay(arenaData, m, { name: 'fb26-roundtrip' });
    const r = playReplay(arenaData, JSON.parse(replayToJson(file)));
    expect(r.mismatch).toBeNull();
    expect(r.hash).toBe(m.hash());
  });

  it('버튼·알림 문구', () => {
    expect(mergeAllButton(0)).toBe('');
    expect(mergeAllButton(3)).toBe('⏫ 모두 승급 3');
    expect(mergeAllText(5)).toBe('⏫ 모두 승급 ×5!');
  });
});
