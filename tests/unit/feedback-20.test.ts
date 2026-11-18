/**
 * 피드백 #20 — '등급이 높을수록 유닛을 크게 (노말이 가장 작게)'.
 * 크기 순서는 공격력 배율 순서(GDD 4.1): 노말 < 레어 < 유니크 < 히어로 < 레전드 < 히든 < 신.
 * 같은 등급 안에서는 몸집 차이를 조금 남기지만, 각성해도 다음 등급의 가장 작은 캐릭터보다 작다.
 * 이 이슈는 크기만 다룬다 (테두리 색·별 크기·용어는 다른 이슈).
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data/load';
import { lookScale, towerLook } from '../../src/art/characters/looks';
import { battleFigureScale } from '../../src/view/render/towerGeom';

const data = loadGameData();
const ORDER = ['normal', 'rare', 'unique', 'hero', 'legend', 'hidden', 'god'] as const;

function scalesOf(grade: string, awakened: boolean): number[] {
  return data.towers.towers.filter((t) => t.grade === grade).map((t) => lookScale(towerLook(t.id), awakened));
}

describe('피드백 #20 등급별 크기', () => {
  it('모든 등급에 타워가 있다', () => {
    for (const g of ORDER) expect(scalesOf(g, false).length, g).toBeGreaterThan(0);
  });

  it('높은 등급의 가장 작은 캐릭터가 낮은 등급의 가장 큰 캐릭터(각성 포함)보다 크다', () => {
    for (let i = 1; i < ORDER.length; i++) {
      const lower = ORDER[i - 1]!;
      const higher = ORDER[i]!;
      const lowerMax = Math.max(...scalesOf(lower, false), ...scalesOf(lower, true));
      const higherMin = Math.min(...scalesOf(higher, false));
      expect(higherMin, `${lower} 최대 ${lowerMax} < ${higher} 최소 ${higherMin}`).toBeGreaterThan(lowerMax);
    }
  });

  it('노말이 가장 작다', () => {
    const normalMax = Math.max(...scalesOf('normal', true));
    for (const g of ORDER.slice(1)) expect(Math.min(...scalesOf(g, false)), g).toBeGreaterThan(normalMax);
  });

  it('전투 화면 크기도 같은 순서 (혼자·붙음 모두)', () => {
    for (const crowded of [false, true]) {
      for (let i = 1; i < ORDER.length; i++) {
        const lowerMax = Math.max(...scalesOf(ORDER[i - 1]!, true).map((s) => battleFigureScale(s, crowded, 99)));
        const higherMin = Math.min(...scalesOf(ORDER[i]!, false).map((s) => battleFigureScale(s, crowded, 99)));
        expect(higherMin).toBeGreaterThan(lowerMax);
      }
    }
  });
});
