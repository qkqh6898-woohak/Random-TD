import { describe, expect, it } from 'vitest';
import { prioritizeDamage } from '../../src/view/render/fxModel';
import { bossPose } from '../../src/view/render/mobPose';

describe('전투 피드백', () => {
  it('×16의 숫자 2개 한도에서도 치명타를 큰 일반 피해보다 먼저 고르고 원본은 보존', () => {
    const hits = [{ damage: 9000, crit: false }, { damage: 12, crit: true }, { damage: 30, crit: true }];
    expect(prioritizeDamage(hits, 2)).toEqual([hits[2], hits[1]]);
    expect(hits[0]!.damage).toBe(9000);
  });
  it('대표 보스 다섯의 움직임이 서로 다르고, 시각이 같으면 자세가 같다', () => {
    const poses = [['batqueen', 'flap'], ['kingslime', 'walk'], ['ancientgolem', 'walk'], ['wraithlord', 'float'], ['chaosdragon', 'flap']] as const;
    const values = poses.map(([id, motion]) => bossPose(id, motion, 373, 0));
    expect(new Set(values.map((x) => JSON.stringify(x))).size).toBe(5);
    expect(values[1]).toEqual(bossPose('kingslime', 'walk', 373, 0));
  });
});
