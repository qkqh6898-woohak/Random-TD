/**
 * 📘 등급·조합 설명 창 (피드백 #24). 전투 일시정지 메뉴의 [📘 등급·조합 설명]으로 연다.
 * 등급 순서(낮음 → 높음, 색·별)와 승급·신화 조합 방법, 신화 조합식(도감과 같은 공개 규칙)을 보여 준다.
 * 값은 gradeGuideModel(순수) — 여기서는 그리기만. <dialog>라 뒤로 가기(nativeBack)·Esc가 닫는다.
 */
import { h } from '../dom';
import type { GradeGuideModel } from './gradeGuideModel';

export interface GradeGuideDialogView {
  el: HTMLDialogElement;
  open(): void;
}

/** [📘 등급·조합 설명] 버튼 (일시정지 메뉴) */
export function gradeGuideButton(view: GradeGuideDialogView): HTMLButtonElement {
  return h('button', {
    class: 'btn pause-grade-guide',
    text: '📘 등급·조합 설명',
    attrs: { type: 'button', 'aria-haspopup': 'dialog', 'data-testid': 'grade-guide-open', 'aria-label': '등급·조합 설명' },
    on: { click: () => view.open() },
  });
}

/** model은 열 때마다 부른다 (판 위 재료·발견 기록이 바뀌므로) */
export function createGradeGuideDialog(model: () => GradeGuideModel): GradeGuideDialogView {
  const close = h('button', { class: 'btn lobby-close gg-close', text: '닫기', attrs: { type: 'button', 'data-testid': 'grade-guide-close' } });
  const body = h('div', { class: 'lobby-dialog-body gg-body', attrs: { 'data-testid': 'grade-guide-body' } });
  const dialog = h(
    'dialog',
    { class: 'title-dialog lobby-dialog gg-dialog', attrs: { 'aria-labelledby': 'gg-title', 'data-testid': 'grade-guide-dialog' } },
    h('header', { class: 'lobby-dialog-head' }, h('h2', { attrs: { id: 'gg-title' }, text: '📘 등급·조합 설명' }), close),
    body,
  );
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) dialog.close();
  });

  const paint = (m: GradeGuideModel): void => {
    const grades = h(
      'ol',
      { class: 'gg-grades', attrs: { 'data-testid': 'grade-guide-grades', 'aria-label': '등급 (낮음 → 높음)' } },
      ...m.rows.map((r) =>
        h(
          'li',
          { class: `gg-grade gg-${r.grade}`, attrs: { 'data-grade': r.grade, style: `--gg-color: ${r.color}` } },
          h('span', { class: 'gg-stars', text: r.stars, attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'gg-name', text: r.name }),
          h('span', { class: 'gg-how', text: r.how }),
        ),
      ),
    );
    const recipes = m.recipes.length
      ? [
          h('h3', { class: 'gg-sub' }, h('span', { text: '💠 신화 조합식' }), h('span', { class: 'gg-count', text: m.recipeSummary, attrs: { 'data-testid': 'grade-guide-recipe-summary' } })),
          h(
            'ul',
            { class: 'gg-recipes', attrs: { 'data-testid': 'grade-guide-recipes' } },
            ...m.recipes.map((r) =>
              h(
                'li',
                { class: `gg-recipe${r.found ? ' is-found' : ''}`, attrs: { 'data-testid': `grade-guide-recipe-${r.id}` } },
                h('span', { class: 'gg-recipe-name', text: r.name }),
                h('span', { class: 'gg-recipe-formula', text: `= ${r.formula}` }),
              ),
            ),
          ),
        ]
      : [];
    body.replaceChildren(
      h('h3', { class: 'gg-sub', text: '등급 (낮음 → 높음)' }),
      grades,
      h('h3', { class: 'gg-sub', text: '승급·조합 방법' }),
      h('ul', { class: 'gg-rules', attrs: { 'data-testid': 'grade-guide-rules' } }, ...m.rules.map((t) => h('li', { text: t }))),
      ...recipes,
    );
  };

  return {
    el: dialog,
    open() {
      paint(model());
      body.scrollTop = 0;
      if (!dialog.open) dialog.showModal();
    },
  };
}
