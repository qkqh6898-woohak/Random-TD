/**
 * 피드백 #20 — '등급이 높을수록 유닛을 크게 (노말이 가장 작게)'.
 * v0.1.14 통합: 배율 값은 디자인 PR #54(FB-D1 #20 characterLooks.json)를 쓴다 — 순서 노말 < 레어 < 유니크 < 히어로 < 레전드 < 신 < 리미티드(히든).
 * (피드백 PR #40은 히든 < 신 순서로 같은 일을 했으나 #54 디자인 결정이 우선이라 배율 값은 버리고 검사만 #54 순서로 옮겼다.)
 * 같은 등급 안에서는 몸집 차이를 조금 남기지만, 각성해도 다음 등급의 가장 작은 캐릭터보다 작다.
 * 칸 무더기(2·3개, fix/stack-fit)는 그림 크기 상한(stackMaxArt)이 절대 상한 — 등급 크기 위에 칸 너비 제한이 먼저다.
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data/load';
import { lookScale, towerLook } from '../../src/art/characters/looks';
import { battleFigureScale } from '../../src/view/render/towerGeom';
import { stackArtScale, stackSlot } from '../../src/view/render/stackGeom';

const data = loadGameData();
const ORDER = ['normal', 'rare', 'unique', 'hero', 'legend', 'god', 'hidden'] as const;

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

  it('무더기 상한과 함께: 혼자(1개)는 등급 크기 그대로, 2·3개는 어느 등급이든 칸 너비 상한(maxArt) 이하', () => {
    for (const g of ORDER) {
      for (const aw of [false, true]) {
        for (const look of scalesOf(g, aw)) {
          for (const crowded of [false, true]) {
            const solo = battleFigureScale(look, crowded, 99);
            expect(stackArtScale(solo, stackSlot(0, 1))).toBe(solo);
            for (const n of [2, 3]) {
              for (let i = 0; i < n; i++) {
                const slot = stackSlot(i, n);
                const art = stackArtScale(solo, slot);
                expect(art, `${g} ${n}개`).toBeLessThanOrEqual(slot.maxArt!);
                expect(art).toBeLessThanOrEqual(solo * slot.scale);
              }
            }
          }
        }
      }
    }
  });
});
