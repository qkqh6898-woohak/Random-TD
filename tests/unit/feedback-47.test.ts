/**
 * 피드백 #47 '영웅 누르면 작은 아이콘이 좌상단 승급 버튼, 우상단 x버튼은 팔기 버튼으로 뜨게하기'.
 * 이슈 본문·판 기록 JSON이 없어 리플레이 재현 테스트 대신 버튼 자리·상태 규칙을 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { QUICK_MIN_PX, quickModel, quickPlacement } from '../../src/ui/panels/towerQuickModel';

describe('피드백 #47 영웅 위 작은 [⬆ 승급]·[✕ 판매]', () => {
  it('승급은 칸 왼쪽 위 모서리, 판매(✕)는 오른쪽 위 모서리', () => {
    const p = quickPlacement(200, 300, 60, 412, 915);
    expect(p.merge).toEqual({ x: 170, y: 270 });
    expect(p.sell).toEqual({ x: 230, y: 270 });
    expect(p.merge.x).toBeLessThan(p.sell.x);
    expect(p.size).toBe(QUICK_MIN_PX);
  });
  it('칸이 크면 칸 너비의 40%, 무대 밖으로는 나가지 않는다', () => {
    expect(quickPlacement(500, 500, 100, 1000, 1000).size).toBe(40);
    const edge = quickPlacement(20, 10, 60, 412, 915);
    expect(edge.merge.x).toBe(QUICK_MIN_PX / 2);
    expect(edge.merge.y).toBe(QUICK_MIN_PX / 2);
    const right = quickPlacement(400, 300, 60, 412, 915);
    expect(right.sell.x).toBe(412 - QUICK_MIN_PX / 2);
  });
  it('상태는 패널과 같다: 승급 켜짐/꺼짐, 판매 확인 중이면 한 번 더 누르면 판매', () => {
    expect(quickModel({ mergeEnabled: true, sellConfirming: false, sellPriceText: '+50원' })).toEqual({
      mergeEnabled: true,
      sellConfirming: false,
      mergeLabel: '승급',
      sellLabel: '판매 +50원',
    });
    const c = quickModel({ mergeEnabled: false, sellConfirming: true, sellPriceText: '+450원' });
    expect(c.mergeEnabled).toBe(false);
    expect(c.sellLabel).toBe('한 번 더 누르면 판매');
  });
});
