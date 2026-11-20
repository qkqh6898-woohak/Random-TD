/**
 * 패배 화면 (M1 임시 결과 화면). 정식 결과·정산 화면(경험치·보상)은 M6·M8에서.
 * 무한: "8단계에서 몹이 150마리를 넘었어요" / 캠페인: "1-2에서 목숨을 모두 잃었어요".
 * 보스 제한 시간 (F10-2): "박쥐 여왕을 60초 안에 잡지 못했어요 · 남은 체력 34%" + 대응 한 줄.
 */
import { h } from '../dom';
import type { UiView } from '../root';
import type { SettlementView } from '../lobby/lobbyModel';

export interface GameOverOptions {
  /** 큰 제목 (기본 '패배'. 캠페인 클리어면 '테마 n 클리어!' — V2 L5) */
  title?: string;
  /** 클리어 화면 (제목 색만 다름) */
  victory?: boolean;
  /** 큰 제목 아래 한 줄 (예: '8단계에서 몹이 150마리를 넘었어요') */
  reason: string;
  /** 기록 (예: '최고 8단계') */
  record: string;
  /** 보스 패배일 때 대응 한 줄 (F10-2, 예: '💡 날 때는 …'). 빈 글자면 줄 없음 */
  tip?: string;
  /** 개발자 모드만 (F10-4 검토, 결정 6): '이번 판 기록' 줄 — 패배 화면이 🛠를 덮어도 첫 소환·첫 승급·보스 시각·남은 체력을 읽을 수 있게 */
  log?: readonly { label: string; value: string }[];
  /** G-3 판 정산 (경험치·골드·보석·영웅 카드·리미티드 조각·최고 웨이브). 없으면 줄 없음 */
  rewards?: SettlementView;
  onRetry: () => void;
  onExit: () => void;
}

/**
 * 사유 줄: ' · '로 나눈 조각마다 줄바꿈하지 않는 묶음 → 좁은 화면에서 '남은 / 체력 34%'처럼 중간에서 끊기지 않고 조각 사이에서 줄이 바뀐다.
 * 글자 내용(textContent)은 그대로.
 */
function reasonLine(reason: string): HTMLElement {
  const parts = reason.split(' · ');
  const kids: (HTMLElement | string)[] = [];
  parts.forEach((p, i) => {
    if (i > 0) kids.push(' · ');
    kids.push(h('span', { class: 'gameover-chunk', text: p }));
  });
  return h('p', { class: 'gameover-reason' }, ...kids);
}

/** 정산 상자 (G-3): 최고 웨이브 · 경험치 바 · 골드/보석/🔥 불꽃(V2.0 PR-A) · 카드(등급 색, 새 영웅 NEW) · 조각 */
function rewardsBox(r: SettlementView): HTMLElement {
  const chips: HTMLElement[] = [];
  const chip = (icon: string, text: string, testid: string): HTMLElement =>
    h('span', { class: 'go-chip', attrs: { 'data-testid': testid } }, h('span', { class: 'go-chip-icon', text: icon, attrs: { 'aria-hidden': 'true' } }), h('span', { text }));
  chips.push(chip('⭐', `경험치 +${r.xp.toLocaleString('ko-KR')}`, 'go-xp'));
  chips.push(chip('💰', `+${r.gold.toLocaleString('ko-KR')}`, 'go-gold'));
  if (r.gems > 0) chips.push(chip('💎', `+${r.gems.toLocaleString('ko-KR')}`, 'go-gems'));
  if (r.flame > 0) chips.push(chip('🔥', `+${r.flame.toLocaleString('ko-KR')}`, 'go-flame'));
  const cardTotal = r.cards.reduce((a, c) => a + c.n, 0);
  const fragTotal = r.fragments.reduce((a, c) => a + c.n, 0);
  return h(
    'div',
    { class: 'go-rewards', attrs: { 'data-testid': 'gameover-rewards' } },
    h(
      'div',
      { class: 'go-best' },
      h('span', { text: `최고 웨이브 ${r.best}` }),
      r.newBest ? h('strong', { class: 'go-newbest', text: '새 기록!' }) : null,
    ),
    h(
      'div',
      { class: 'go-level' },
      h('span', { class: 'go-level-text', text: `계정 Lv ${r.level}${r.levelUps.length > 0 ? ' ⬆' : ''}` }),
      h('span', { class: 'go-xpbar', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'go-xpfill', attrs: { style: `width:${Math.round(r.xpRatio * 100)}%` } })),
    ),
    h('div', { class: 'go-chips' }, ...chips),
    cardTotal > 0
      ? h(
          'div',
          { class: 'go-cards', attrs: { 'data-testid': 'go-cards', 'aria-label': `영웅 카드 ${cardTotal}장` } },
          ...r.cards.map((c) =>
            h(
              'span',
              { class: 'go-card', attrs: { style: `--grade-color:${c.color}` } },
              h('span', { class: 'go-card-name', text: c.name }),
              h('span', { class: 'go-card-n', text: `×${c.n}` }),
              c.isNew ? h('span', { class: 'go-card-new', text: 'NEW' }) : null,
            ),
          ),
        )
      : null,
    fragTotal > 0
      ? h('div', { class: 'go-frags', attrs: { 'data-testid': 'go-frags' } }, `🧩 리미티드 조각 ${r.fragments.map((f) => `${f.name} +${f.n}`).join(' · ')}`)
      : null,
    r.recruitGain > 0 ? h('div', { class: 'go-recruit', text: `영웅 모집 게이지 +${r.recruitGain}` }) : null,
  );
}

export function createGameOverScreen(opts: GameOverOptions): UiView {
  const retry = h(
    'button',
    {
      class: 'btn btn-primary gameover-retry',
      attrs: { type: 'button', 'data-action': 'retry', 'aria-label': '다시 하기' },
      on: { click: () => opts.onRetry() },
    },
    h('span', { class: 'btn-icon', text: '↻', attrs: { 'aria-hidden': 'true' } }),
    h('span', { text: '다시 하기' }),
  );
  const exit = h('button', {
    class: 'btn gameover-exit',
    attrs: { type: 'button', 'data-action': 'exit', 'aria-label': '로비로' },
    text: '로비로',
    on: { click: () => opts.onExit() },
  });
  const el = h(
    'div',
    {
      class: `screen gameover-screen${opts.victory ? ' is-victory' : ''}`,
      attrs: { 'data-screen': 'gameover', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gameover-title' },
    },
    h(
      'div',
      { class: 'pause-panel gameover-panel' },
      h('h2', { class: 'gameover-title', text: opts.title ?? '패배', attrs: { id: 'gameover-title', 'data-testid': 'gameover-title' } }),
      reasonLine(opts.reason),
      h('p', { class: 'gameover-record', text: opts.record }),
      opts.rewards ? rewardsBox(opts.rewards) : null,
      opts.tip ? h('p', { class: 'gameover-tip', attrs: { 'data-testid': 'gameover-tip' }, text: opts.tip }) : null,
      opts.log && opts.log.length > 0
        ? h(
            'div',
            { class: 'dv-log gameover-log', attrs: { 'data-testid': 'gameover-run-log' } },
            h('div', { class: 'dv-log-title', text: '📝 이번 판 기록 (개발자)' }),
            ...opts.log.map((r) => h('div', { class: 'dv-log-row' }, h('span', { class: 'dv-log-label', text: r.label }), h('span', { class: 'dv-log-value', text: r.value }))),
          )
        : null,
      retry,
      exit,
    ),
  );
  queueMicrotask(() => retry.focus({ preventScroll: true }));
  return { el };
}
