/**
 * 피드백 #47: 고른 영웅(타워) 칸 왼쪽 위의 작은 둥근 [⬆] 승급 버튼 (DOM, quick 층).
 * 정보 패널과 함께 열리고 닫힌다. 버튼은 패널과 같은 콜백(Game.sendMerge)을 부른다 — sim은 바꾸지 않는다.
 * v0.1.14 통합: 오른쪽 위 [✕ 판매]는 뺐다 — 판매 버튼은 정보 패널 머리 줄(디자인 PR #54, FB-D1 #30) 하나뿐.
 */
import { h } from '../dom';
import type { UiView } from '../root';
import type { QuickModel, QuickPlacement } from './towerQuickModel';

export interface TowerQuickView extends UiView {
  update(m: QuickModel): void;
  place(p: QuickPlacement): void;
}

export function createTowerQuick(opts: { onMerge: () => void }): TowerQuickView {
  const merge = h('button', {
    class: 'tq-btn tq-merge',
    attrs: { type: 'button', 'data-testid': 'tq-merge', 'aria-label': '승급' },
    text: '⬆',
    on: { click: () => opts.onMerge() },
  });
  const el = h('div', { class: 'tower-quick', attrs: { 'data-testid': 'tower-quick' } }, merge);
  let lastPlace = '';
  return {
    el,
    update(m) {
      merge.disabled = !m.mergeEnabled;
      if (merge.getAttribute('aria-label') !== m.mergeLabel) merge.setAttribute('aria-label', m.mergeLabel);
    },
    place(p) {
      const key = `${p.size}|${p.merge.x},${p.merge.y}`;
      if (key === lastPlace) return;
      lastPlace = key;
      merge.style.width = `${p.size}px`;
      merge.style.height = `${p.size}px`;
      merge.style.left = `${Math.round(p.merge.x - p.size / 2)}px`;
      merge.style.top = `${Math.round(p.merge.y - p.size / 2)}px`;
      el.style.fontSize = `${Math.round(p.size * 0.55)}px`;
    },
  };
}
