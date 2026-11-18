/**
 * 피드백 #47: 고른 영웅(타워) 칸 위의 작은 둥근 버튼 (DOM, quick 층). 왼쪽 위 [⬆] = 승급, 오른쪽 위 [✕] = 판매.
 * 정보 패널과 함께 열리고 닫힌다. 버튼은 패널과 같은 콜백(Game.sendMerge·sendSell)을 부른다 — sim은 바꾸지 않는다.
 */
import { h } from '../dom';
import type { UiView } from '../root';
import type { QuickModel, QuickPlacement } from './towerQuickModel';

export interface TowerQuickView extends UiView {
  update(m: QuickModel): void;
  place(p: QuickPlacement): void;
}

export function createTowerQuick(opts: { onMerge: () => void; onSell: () => void }): TowerQuickView {
  const merge = h('button', {
    class: 'tq-btn tq-merge',
    attrs: { type: 'button', 'data-testid': 'tq-merge', 'aria-label': '승급' },
    text: '⬆',
    on: { click: () => opts.onMerge() },
  });
  const sell = h('button', {
    class: 'tq-btn tq-sell',
    attrs: { type: 'button', 'data-testid': 'tq-sell', 'aria-label': '판매' },
    text: '✕',
    on: { click: () => opts.onSell() },
  });
  const el = h('div', { class: 'tower-quick', attrs: { 'data-testid': 'tower-quick' } }, merge, sell);
  let lastPlace = '';
  return {
    el,
    update(m) {
      merge.disabled = !m.mergeEnabled;
      if (merge.getAttribute('aria-label') !== m.mergeLabel) merge.setAttribute('aria-label', m.mergeLabel);
      sell.classList.toggle('is-confirm', m.sellConfirming);
      if (sell.getAttribute('aria-label') !== m.sellLabel) sell.setAttribute('aria-label', m.sellLabel);
    },
    place(p) {
      const key = `${p.size}|${p.merge.x},${p.merge.y}|${p.sell.x},${p.sell.y}`;
      if (key === lastPlace) return;
      lastPlace = key;
      for (const [btn, at] of [
        [merge, p.merge],
        [sell, p.sell],
      ] as const) {
        btn.style.width = `${p.size}px`;
        btn.style.height = `${p.size}px`;
        btn.style.left = `${Math.round(at.x - p.size / 2)}px`;
        btn.style.top = `${Math.round(at.y - p.size / 2)}px`;
      }
      el.style.fontSize = `${Math.round(p.size * 0.55)}px`;
    },
  };
}
