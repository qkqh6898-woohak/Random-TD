/**
 * 피드백 #61 (제목만, 본문·판 기록 JSON 없음 → 리플레이 재현 대상 없음):
 *  1. 웨이브 보상(웨이브 길)을 1000웨이브까지 — progression.json waveRoad.milestones (판 밖 메타라 sim·리플레이와 무관)
 *  2. 리미티드 해방을 누르면 목록이 맨 위로 굴러가는 버그 — 화면 쪽, e2e/fb61.spec.ts
 */
import { describe, expect, it } from 'vitest';
import { claimAllMilestones, newProgress, readyMilestones } from '../../src/meta/progress';
import { loadProgression } from '../../src/meta/progressionData';
import { waveRoad } from '../../src/ui/lobby/lobbyModel';
import { data } from '../helpers/match';

const pd = loadProgression(data);
const ms = pd.waveRoad.milestones;

describe('피드백 #61 웨이브 길 1000웨이브까지', () => {
  it('10웨이브마다 10 ~ 1000 (100개), 1~100웨이브 보상은 예전 그대로', () => {
    expect(ms.map((m) => m.wave)).toEqual(Array.from({ length: 100 }, (_, i) => (i + 1) * 10));
    expect(ms[0]!.reward).toEqual({ gold: 300, cards: 3 });
    expect(ms[9]!.reward).toEqual({ gems: 200, fragments: 10 });
  });

  it('100웨이브마다 같은 자리 보상은 같은 종류로 줄지 않고 커진다', () => {
    for (let i = 10; i < ms.length; i++) {
      const prev = ms[i - 10]!.reward as Record<string, number>;
      const cur = ms[i]!.reward as Record<string, number>;
      expect(Object.keys(cur).sort()).toEqual(Object.keys(prev).sort());
      for (const k of Object.keys(cur)) expect(cur[k]!).toBeGreaterThan(prev[k]!);
    }
  });

  it('최고 1000웨이브면 100개 모두 받을 수 있고 [받기] 한 번에 다 받는다', () => {
    const s = newProgress(pd, data, 1);
    s.bestWave = 1000;
    expect(readyMilestones(s, pd)).toBe(100);
    const road = waveRoad(s, pd);
    expect(road.nodes).toHaveLength(100);
    expect(road.nodes[99]).toMatchObject({ wave: 1000, state: 'ready' });
    const r = claimAllMilestones(s, pd, data)!;
    expect(r.waves).toHaveLength(100);
    expect(readyMilestones(s, pd)).toBe(0);
  });

  it('100웨이브를 넘으면 다음 보상이 이어진다 (예전에는 "모두 받았어요")', () => {
    const s = newProgress(pd, data, 1);
    s.bestWave = 123;
    expect(waveRoad(s, pd).next).toBe(130);
  });
});
