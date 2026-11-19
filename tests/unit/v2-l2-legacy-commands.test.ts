/**
 * V2 검토 L2: 예전 명령(summon·merge·mergeAll·move)이 일반 판에서도 실행되어 칸 무더기 규칙(인원 한도·한 칸 한 타워)을 우회하던 것.
 * 결정: 예약 단계에서 거절 (실행 기록에도 남지 않음). 리플레이 재생(playReplay·recordReplay)은 MatchOptions.legacyCommands로 받고,
 * 개발자 판(debug)은 치트 판이라 그대로 받는다.
 */
import { describe, expect, it } from 'vitest';
import { createMatch, LEGACY_COMMAND_TYPES } from '../../src/sim/match';
import type { CommandInput } from '../../src/sim/Commands';
import { listTowers } from '../../src/sim/entities/Tower';
import { playReplay, recordReplay, replayToJson, type ReplayFile } from '../../src/sim/replay';
import { MatchSaves } from '../../src/save/MatchSaves';
import { MemoryStorage } from '../../src/save/storage';
import { data } from '../helpers/match';

const LEGACY: CommandInput[] = [
  { type: 'summon', x: 1, y: 2 },
  { type: 'merge', x: 1, y: 2 },
  { type: 'mergeAll', x: 1, y: 2 },
  { type: 'move', fx: 1, fy: 2, tx: 2, ty: 2 },
];

describe('L2 예전 명령은 리플레이·개발자 판에서만', () => {
  it('목록 = summon·merge·mergeAll·move', () => {
    expect([...LEGACY_COMMAND_TYPES].sort()).toEqual(['merge', 'mergeAll', 'move', 'summon']);
  });

  it('일반 판: 예전 명령은 예약에서 거절되고 실행 기록에도 남지 않는다 (무더기 명령은 받는다)', () => {
    const m = createMatch(data, { seed: 3, mode: 'infinite' });
    for (const c of LEGACY) {
      const r = m.world.enqueue(c);
      expect(r.ok, c.type).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/리플레이/);
    }
    expect(m.world.enqueue({ type: 'summonAuto' }).ok).toBe(true);
    m.step();
    expect(m.world.executed.map((c) => c.type)).toEqual(['summonAuto']);
    expect(listTowers(m.world)).toHaveLength(1);
  });

  it('개발자 판(debug)은 예전 명령도 받는다 (E2E·개발 도구)', () => {
    const m = createMatch(data, { seed: 3, mode: 'infinite', debug: true });
    const [x, y] = m.map.buildable[0]!;
    expect(m.world.enqueue({ type: 'summon', x, y }).ok).toBe(true);
    m.step();
    expect(listTowers(m.world)).toHaveLength(1);
  });

  it('일반 판 이어 하기(저장에서 되살린 판)도 예전 명령을 받지 않는다', () => {
    const store = new MatchSaves(data, new MemoryStorage(), { version: 'test', dev: false });
    const m = createMatch(data, { seed: 3, mode: 'infinite' });
    m.stepN(5);
    expect(store.write(m, 1, null, 'run-l2')).not.toBeNull();
    const resumed = store.read()!.match;
    expect(resumed.world.enqueue({ type: 'summon', x: 1, y: 2 }).ok).toBe(false);
  });

  it('예전 명령이 든 일반(비개발자) 리플레이는 그대로 재생된다 (주기·끝 해시 같음)', () => {
    const m = createMatch(data, { seed: 7, mode: 'infinite', legacyCommands: true });
    const pads = m.map.buildable;
    for (let i = 0; i < 4; i++) {
      expect(m.world.enqueue({ type: 'summon', x: pads[i]![0], y: pads[i]![1] }).ok).toBe(true);
      m.stepN(20);
    }
    expect(m.world.enqueue({ type: 'move', fx: pads[0]![0], fy: pads[0]![1], tx: pads[5]![0], ty: pads[5]![1] }).ok).toBe(true);
    m.stepN(200);
    const file = recordReplay(data, m, { name: 'l2-legacy', checkpointTicks: 50 });
    expect(file.debug).toBe(false);
    expect(file.commands.filter((c) => LEGACY_COMMAND_TYPES.includes(String(c.type))).length).toBe(5);
    const r = playReplay(data, JSON.parse(replayToJson(file)) as ReplayFile);
    expect(r.mismatch).toBeNull();
    expect(r.hash).toBe(m.hash());
    expect(listTowers(r.match.world)).toHaveLength(4);
  });
});
