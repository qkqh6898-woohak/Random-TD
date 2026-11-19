/**
 * 피드백 #65 — 일꾼 옆 [⬆ 승급 가능 n] 없애고 맵 오른쪽 위 [⏫ 모두 승급] 하나로: 한 번 누르면 전체 승급, 꾹 누르면 계속.
 * 이슈에 판 기록 JSON이 없어 리플레이 재현 대신: 화면 모델(아래 띠에 승급 글자 없음) · 꾹 누르기 간격 ·
 * '모두 승급' 명령을 꾹 누른 것처럼 되풀이한 판을 replay.ts로 기록 → JSON → 재생해 같은 해시인지 확인한다.
 */
import { describe, expect, it } from 'vitest';
import { listTowers } from '../../src/sim/entities/Tower';
import { fullStacks } from '../../src/sim/systems/Merge';
import { placeTower } from '../../src/sim/systems/Summon';
import { playReplay, recordReplay, replayToJson } from '../../src/sim/replay';
import { buildHudModel } from '../../src/ui/hud/hudModel';
import { HOLD_DELAY_MS, MERGE_ALL_POLL_MS, mergeAllHoldDelay } from '../../src/ui/hold';
import { arena, arenaData, command, infinite } from '../helpers/match';

describe('피드백 #65 승급 버튼 하나로', () => {
  it('아래 띠 HUD 모델에 [⬆ 승급 가능 n] 글자가 없다 (맵 오른쪽 위 [⏫ 모두 승급]만)', () => {
    const m = arena(65);
    const model = buildHudModel({ state: m.state, ticksLeft: 100, mobCount: 0, tick: 0, speed: 1, towerCount: 3, buildableCount: 24, summonCost: 100 }, arenaData.game.hud);
    expect('mergeReady' in model).toBe(false);
  });

  it('꾹 누르기 간격: 처음은 다른 꾹 누르기와 같고, 그 뒤 일정한 짧은 간격으로 다시 묻는다', () => {
    expect(mergeAllHoldDelay(0)).toBe(HOLD_DELAY_MS);
    expect(mergeAllHoldDelay(1)).toBe(MERGE_ALL_POLL_MS);
    expect(mergeAllHoldDelay(50)).toBe(MERGE_ALL_POLL_MS);
    expect(MERGE_ALL_POLL_MS).toBeGreaterThan(0);
    expect(MERGE_ALL_POLL_MS).toBeLessThan(HOLD_DELAY_MS);
  });

  it('한 번 누르면 가득 찬 무더기가 남지 않고, 되풀이(꾹)해도 상태가 깨지지 않는다', () => {
    const m = arena(65);
    const pads = m.map.buildable;
    for (let p = 0; p < 4; p++) for (let i = 0; i < 3; i++) placeTower(m.world, p % 2 ? 'archer' : 'goblin', 0, pads[p]![0], pads[p]![1]);
    expect(fullStacks(m.ctx, m.world, 0).length).toBe(4);
    command(m, { type: 'mergeAllStacks' });
    expect(fullStacks(m.ctx, m.world, 0)).toHaveLength(0);
    const towers = listTowers(m.world).length;
    const merges = m.state.merges;
    // 꾹 누르기: 남은 게 없으면 상태가 그대로
    command(m, { type: 'mergeAllStacks' });
    command(m, { type: 'mergeAllStacks' });
    expect(listTowers(m.world).length).toBe(towers);
    expect(m.state.merges).toBe(merges);
  });

  it('리플레이: 소환 → 모두 승급을 꾹 누른 것처럼 여러 번 → JSON 왕복 재생이 같은 해시', () => {
    const m = infinite(6501, { debug: true });
    command(m, { type: 'debugAddGold', amount: 500_000 });
    for (let i = 0; i < 18; i++) command(m, { type: 'summonAuto' });
    command(m, { type: 'mergeAllStacks' });
    expect(fullStacks(m.ctx, m.world, 0)).toHaveLength(0);
    // 꾹: 남은 게 없을 때도 되풀이 (sim은 mergeFail none, 상태 그대로)
    command(m, { type: 'mergeAllStacks' });
    for (let i = 0; i < 6; i++) command(m, { type: 'summonAuto' });
    command(m, { type: 'mergeAllStacks' });
    expect(fullStacks(m.ctx, m.world, 0)).toHaveLength(0);
    m.stepN(100);
    const file = recordReplay(arenaData, m, { name: 'fb65-hold' });
    const r = playReplay(arenaData, JSON.parse(replayToJson(file)));
    expect(r.mismatch).toBeNull();
    expect(r.hash).toBe(m.hash());
  });
});
