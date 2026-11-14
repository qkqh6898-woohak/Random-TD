/**
 * M3b 화면 순수 계산: 몹 상태 이상 표시(색·아이콘·멈춘 걸음), 진흙 웅덩이 투명도·크기.
 */
import { describe, expect, it } from 'vitest';
import { emptyMobStatus } from '../../src/sim/entities/Mob';
import { puddleLook } from '../../src/view/render/abilityModel';
import { MAX_STATUS_ICONS, NO_STATUS, STATUS_TINTS, mobStatusView } from '../../src/view/render/statusModel';

const base = { ...emptyMobStatus(), markBp: 0 };

describe('몹 상태 이상 표시 (statusModel)', () => {
  it('아무것도 없으면 표시 없음', () => {
    expect(mobStatusView(base, 100)).toBe(NO_STATUS);
  });

  it('빙결: 하늘색 + ❄ 아이콘 + 얼음 + 걸음 멈춤, 풀린 틱부터는 없음', () => {
    const m = { ...base, freezeUntil: 110 };
    expect(mobStatusView(m, 109)).toEqual({ tint: STATUS_TINTS.freeze, icons: ['freeze'], paused: true, frozen: true });
    expect(mobStatusView(m, 110)).toBe(NO_STATUS);
  });

  it('둔화 + 화상 + 독: 색은 화상(둔화보다 눈에 띄는 쪽), 아이콘 순서 고정, 걸음은 계속', () => {
    const m = {
      ...base,
      slowBp: 2500,
      dots: [
        { src: 'poisonarcher', kind: 'poison', dps: 1, until: 200 },
        { src: 'flamemage', kind: 'burn', dps: 1, until: 200 },
      ],
    };
    const v = mobStatusView(m, 100);
    expect(v.icons).toEqual(['slow', 'burn', 'poison']);
    expect(v.tint).toBe(STATUS_TINTS.burn);
    expect(v.paused).toBe(false);
  });

  it('아이콘은 최대 4개 (빙결·정지·기절·둔화가 먼저), 풀린 약화·지속 피해는 빠진다', () => {
    const m = {
      ...base,
      freezeUntil: 200,
      stopUntil: 200,
      stunUntil: 200,
      slowBp: 1000,
      markBp: 1500,
      dots: [{ src: 'a', kind: 'bleed', dps: 1, until: 50 }],
      vulns: [{ src: 'd', bp: 1000, until: 50 }],
    };
    const v = mobStatusView(m, 100);
    expect(v.icons).toHaveLength(MAX_STATUS_ICONS);
    expect(v.icons).toEqual(['freeze', 'stop', 'stun', 'slow']);
    expect(mobStatusView({ ...base, markBp: 1500, vulns: [{ src: 'd', bp: 1000, until: 150 }] }, 100).icons).toEqual(['mark', 'vuln']);
  });
});

describe('진흙 웅덩이 그림 (puddleLook)', () => {
  it('생길 때 커지고, 사라지기 10틱 전부터 옅어진다', () => {
    const p = { bornTick: 100, until: 160 };
    expect(puddleLook(p, 100).scale).toBeCloseTo(0.2);
    expect(puddleLook(p, 102).scale).toBeCloseTo(0.5);
    expect(puddleLook(p, 110)).toEqual({ alpha: 0.85, scale: 1 });
    expect(puddleLook(p, 155).alpha).toBeCloseTo(0.425);
    expect(puddleLook(p, 160).alpha).toBe(0);
  });
});
