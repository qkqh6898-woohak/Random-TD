/**
 * 피드백 #30 '유닛 판매 버튼을 상단에 작게': 정보 패널의 판매 버튼을 머리 줄(초상·이름 옆, [✕] 왼쪽)에 작은 두 줄 버튼으로 둔다.
 * 히어로 이상은 두 번 눌러야 팔리는 규칙(game.json sell.confirmGrades)은 그대로.
 * v0.1.14 통합: 머리 줄 판매 버튼 모양·자리는 디자인 PR #54(FB-D1 #30, `.tp-head > .tp-sell`)를 쓴다 — 피드백 PR #56의 두 줄 칩(sellChipLines)은
 * 같은 일을 겹쳐 해서 뺐다. 판매 버튼은 정보 패널 머리 줄 하나뿐 (PR #51의 칸 위 [✕ 판매]도 뺌 — e2e/fb47·t2가 화면에서 센다).
 * v0.1.22 B①: 승급·이동도 머리 줄로 올라와 [⬆ 승급] [↔ 이동] [판매] [✕] (아래 버튼 줄 없음).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sellLabel, sellNeedsConfirm } from '../../src/ui/panels/towerPanelModel';

describe('피드백 #30 머리 줄 작은 판매 버튼', () => {
  it('글자: 보통 \'💰 판매 +n원\', 확인 중 \'한 번 더 누르면 판매\'', () => {
    expect(sellLabel(1350, false)).toBe('💰 판매 +1,350원');
    expect(sellLabel(1350, true)).toBe('한 번 더 누르면 판매');
  });
  it('판매 버튼은 머리 줄에 있고 아래 버튼 줄은 없다 (TowerPanel 조립) — v0.1.22 B①: [⬆ 승급] [↔ 이동] [판매] [✕] 순서', () => {
    const src = readFileSync(new URL('../../src/ui/panels/TowerPanel.ts', import.meta.url), 'utf8');
    const head = src.slice(src.indexOf("{ class: 'tp-head' }"), src.indexOf('desc,', src.indexOf("{ class: 'tp-head' }")));
    const acts = head.slice(head.indexOf("{ class: 'tp-head-actions' }"));
    const line = acts.slice(0, acts.indexOf('\n'));
    expect(line).toMatch(/mergeBtn, moveBtn, convertBtn, sellBtn, close\)/);
    expect(src).not.toContain('tp-act-wrap');
    const css = readFileSync(new URL('../../src/ui/feedback-design.css', import.meta.url), 'utf8');
    expect(css).toContain('.tp-head-actions > .tp-sell');
  });
  it('높은 등급 두 번 누르기 규칙은 그대로', () => {
    const grades = ['hero', 'legend', 'god', 'hidden'] as const;
    expect(sellNeedsConfirm('hero', grades)).toBe(true);
    expect(sellNeedsConfirm('normal', grades)).toBe(false);
  });
});
