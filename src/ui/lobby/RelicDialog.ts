/**
 * V3 P2 유물 진열장 (docs/v3/ui-contract.md P2). 로비 대화 상자 껍데기(dialogShell)를 받아 내용만 그린다.
 * 머리줄: 제목 · 🗝️ 열쇠 · 닫기 (고정) / 본문만 스크롤: 첫 유물 선택 → 목표·천장 → 발견 → 12종 2열 카드 → 상세(강화·목표) → 5:1 교환.
 * 자격·비용은 relicModel(메타 규칙)에서만 읽는다. 상태는 색 + 자물쇠·체크·숫자·글로 함께 보여 준다.
 */
import { h } from '../dom';
import { assetUrl } from '../../assets';
import type { GameData } from '../../data/load';
import type { ProgressStore } from '../../meta/progressStore';
import { checkExchange } from '../../meta/v3/relics';
import { KEY_ART, poolConfigs, relicDetail, relicEffectText, relicShowcase, type RelicCardModel } from './relicModel';

export interface RelicDialogDeps {
  progress: ProgressStore;
  data: GameData;
  toast: (text: string, ms?: number) => void;
}

const fmt = (n: number): string => n.toLocaleString('ko-KR');

/** 유물 그림: 시범 WebP(비율 유지 contain) 또는 코드 도형 임시 아이콘 (역할별 모양 + 이름 첫 글자) */
export function relicIcon(c: Pick<RelicCardModel, 'art' | 'glyph' | 'roleKey' | 'name'>, size: 48 | 96): HTMLElement {
  if (c.art) {
    return h('img', { class: `relic-art relic-art-${size}`, attrs: { src: assetUrl(c.art), alt: '', 'aria-hidden': 'true', width: String(size), height: String(size), decoding: 'async' } });
  }
  return h('span', { class: `relic-art relic-art-${size} relic-shape relic-shape-${c.roleKey}`, attrs: { 'aria-hidden': 'true', 'data-placeholder': '1' } }, h('span', { text: c.glyph }));
}

export function keyIcon(size: 32 | 48): HTMLElement {
  return h('img', { class: `relic-key-icon relic-key-${size}`, attrs: { src: assetUrl(KEY_ART), alt: '', 'aria-hidden': 'true', width: String(size), height: String(size) } });
}

export function mountRelicDialog(shell: { dialog: HTMLDialogElement; body: HTMLElement; title: HTMLElement }, deps: RelicDialogDeps): { open(): void; render(): void } {
  const { progress, data, toast } = deps;
  const pd = progress.pd;
  let selected: string | null = null;
  let firstChoice: string | null = null;
  let lastFound: string[] = [];
  const spend: Record<string, number> = {};
  shell.dialog.classList.add('relic-dialog');
  const keysEl = h('span', { class: 'relic-keys', attrs: { 'data-testid': 'relic-keys' } });
  shell.title.after(keysEl);

  function setKeys(n: number): void {
    keysEl.replaceChildren(keyIcon(32), h('span', { text: fmt(n) }));
    keysEl.setAttribute('aria-label', `탐험 열쇠 ${fmt(n)}개`);
  }

  function firstPickSection(): HTMLElement {
    const configs = poolConfigs(pd, data);
    return h(
      'section',
      { class: 'relic-first', attrs: { 'data-testid': 'relic-first-pick', 'aria-label': '첫 유물 고르기' } },
      h('h3', { class: 'relic-h', text: '첫 유물을 하나 골라요 (선택권 1회)' }),
      h('p', { class: 'relic-note', text: '12종 모두 같은 조건이에요. 고른 유물은 바로 Lv1로 해금되고 목표 유물이 돼요.' }),
      h(
        'div',
        { class: 'relic-grid' },
        ...configs.map((cfg) => {
          const art = relicShowcase(progress.state, pd, data).cards.find((c) => c.id === cfg.id) as RelicCardModel;
          return h(
            'button',
            {
              class: `relic-card relic-pick${firstChoice === cfg.id ? ' is-selected' : ''}`,
              attrs: { type: 'button', 'data-relic': cfg.id, 'aria-pressed': firstChoice === cfg.id ? 'true' : 'false' },
              on: {
                click: () => {
                  firstChoice = cfg.id;
                  render();
                },
              },
            },
            relicIcon(art, 48),
            h('span', { class: 'relic-card-text' }, h('strong', { text: cfg.name }), h('small', { text: art.role }), h('small', { class: 'relic-card-effect', text: relicEffectText(data, cfg.id, 1) })),
          );
        }),
      ),
      h(
        'button',
        {
          class: 'btn btn-primary relic-first-confirm',
          attrs: { type: 'button', 'data-testid': 'relic-first-confirm', ...(firstChoice ? {} : { disabled: '' }) },
          on: {
            click: () => {
              if (firstChoice && progress.pickFirstRelic(firstChoice)) {
                toast(`✨ 첫 유물: ${data.game.relics.find((r) => r.id === firstChoice)?.name ?? ''}`, 1800);
                selected = firstChoice;
                firstChoice = null;
                render();
              }
            },
          },
        },
        firstChoice ? `이 유물로 시작 (${data.game.relics.find((r) => r.id === firstChoice)?.name ?? ''})` : '유물을 골라 주세요',
      ),
    );
  }

  function render(): void {
    const m = relicShowcase(progress.state, pd, data);
    setKeys(m.keys);
    if (!selected || !m.cards.some((c) => c.id === selected)) selected = m.target?.id ?? m.cards[0]?.id ?? null;
    const d = selected ? relicDetail(progress.state, pd, data, selected) : null;
    const discover = (n: number): void => {
      const r = progress.discoverRelics(n);
      if (r === 'keys') return;
      lastFound = r.map((x) => `${data.game.relics.find((c) => c.id === x.id)?.name ?? x.id}${x.pity ? ' (보장)' : ''}`);
      toast(`🗝️ 발견: ${lastFound.join(', ')}`, 2200);
      render();
    };
    const exchangeTotal = Object.values(spend).reduce((a, b) => a + b, 0);
    const exCheck = checkExchange(progress.state.v3, pd, spend);
    const exchangeable = m.cards.filter((c) => !c.isTarget && c.fragments > 0);
    const parts: (HTMLElement | null)[] = [
      m.firstPick ? firstPickSection() : null,
      h(
        'section',
        { class: 'relic-summary', attrs: { 'data-testid': 'relic-summary' } },
        m.target
          ? h('p', { class: 'relic-target' }, h('strong', { text: '🎯 목표 ' }), `${m.target.name} · ${m.target.isMax ? '만렙' : `Lv ${m.target.level}/${m.target.maxLevel} · 조각 ${m.target.fragments}/${m.target.need ?? 0}`}`)
          : h('p', { class: 'relic-target' }, h('strong', { text: '🎯 목표 없음 ' }), `보급의 목표 조각 ${m.targetBank}개를 보관 중 — 목표를 정하면 옮겨져요`),
        h('p', { class: 'relic-pity', attrs: { 'data-testid': 'relic-pity' }, text: m.pityLeft === 1 ? `다음 발견은 미보유 보장!` : `미보유 보장까지 ${m.pityLeft}번 (${m.pityEvery}번째마다)` }),
      ),
      h(
        'section',
        { class: 'relic-discover', attrs: { 'aria-label': '유물 발견' } },
        h(
          'div',
          { class: 'relic-discover-row' },
          h(
            'button',
            { class: `btn btn-primary relic-discover-1${m.keys < 1 ? ' is-short' : ''}`, attrs: { type: 'button', 'data-testid': 'relic-discover', ...(m.keys < 1 ? { disabled: '' } : {}) }, on: { click: () => discover(1) } },
            keyIcon(32),
            h('span', { text: '1개로 발견' }),
          ),
          h(
            'button',
            { class: `btn btn-secondary relic-discover-10${m.keys < 10 ? ' is-short' : ''}`, attrs: { type: 'button', 'data-testid': 'relic-discover-10', ...(m.keys < 10 ? { disabled: '' } : {}) }, on: { click: () => discover(10) } },
            keyIcon(32),
            h('span', { text: '10개로 발견' }),
          ),
        ),
        h('p', { class: 'relic-note', attrs: { 'data-testid': 'relic-odds' }, text: `공개 ${m.poolSize}종 중 하나의 조각 (각 ${(100 / m.poolSize).toFixed(1)}%). ${m.pityEvery}번째 발견은 미보유 유물 보장 — 모두 가졌으면 만렙이 아닌 가장 낮은 레벨. 미보유 유물 조각은 받는 즉시 Lv1로 해금돼요.` }),
        m.keys < 1 ? h('p', { class: 'relic-note relic-short', attrs: { 'data-testid': 'relic-keys-need' }, text: '🗝️ 열쇠 1개가 더 필요해요 — 10웨이브 이상 끝낸 전투의 보급에서 얻어요' }) : null,
        lastFound.length > 0 ? h('p', { class: 'relic-found', attrs: { 'data-testid': 'relic-found', role: 'status' }, text: `방금 발견: ${lastFound.join(', ')}` }) : null,
      ),
      h(
        'div',
        { class: 'relic-grid', attrs: { 'data-testid': 'relic-grid' } },
        ...m.cards.map((c) =>
          h(
            'button',
            {
              class: `relic-card${c.owned ? ' is-owned' : ' is-locked'}${c.id === selected ? ' is-selected' : ''}${c.isMax ? ' is-max' : ''}`,
              attrs: {
                type: 'button',
                'data-relic': c.id,
                'aria-pressed': c.id === selected ? 'true' : 'false',
                'aria-label': `${c.name} · ${c.owned ? (c.isMax ? `만렙 Lv ${c.level}` : `Lv ${c.level}/${c.maxLevel}, 조각 ${c.fragments}/${c.need ?? 0}`) : '미보유'}${c.ready ? ' · 강화 가능' : ''}${c.isTarget ? ' · 목표' : ''}`,
              },
              on: {
                click: () => {
                  selected = c.id;
                  render();
                },
              },
            },
            relicIcon(c, 48),
            h(
              'span',
              { class: 'relic-card-text' },
              h('strong', { text: c.name }),
              h('small', { text: c.owned ? (c.isMax ? `Lv ${c.level} · 만렙` : `Lv ${c.level}/${c.maxLevel}`) : '🔒 미보유' }),
              c.owned && !c.isMax ? h('small', { text: `조각 ${c.fragments}/${c.need ?? 0}` }) : c.isMax ? h('small', { text: `조각 ${c.fragments}` }) : null,
            ),
            c.isTarget ? h('span', { class: 'relic-tag relic-tag-target', text: '🎯' }) : null,
            c.ready ? h('span', { class: 'relic-tag relic-tag-ready', text: '⬆', attrs: { 'aria-hidden': 'true' } }) : null,
          ),
        ),
      ),
      d
        ? h(
            'section',
            { class: `relic-detail${d.owned ? '' : ' is-locked'}`, attrs: { 'data-testid': 'relic-detail', 'data-relic': d.id } },
            h('div', { class: 'relic-detail-top' }, relicIcon(d, 96), h('div', { class: 'relic-detail-head' }, h('strong', { class: 'relic-detail-name', text: d.name }), h('small', { text: `${d.role} · ${d.owned ? (d.isMax ? `만렙 Lv ${d.level}` : `Lv ${d.level}/${d.maxLevel}`) : '🔒 미보유 (조각 1개면 해금)'}` }))),
            h('p', { class: 'relic-effect', attrs: { 'data-testid': 'relic-effect' } }, h('strong', { text: d.owned ? '지금 ' : 'Lv1 ' }), d.effectNow),
            d.effectNext ? h('p', { class: 'relic-effect relic-effect-next' }, h('strong', { text: '다음 ' }), d.effectNext) : null,
            d.cost
              ? h(
                  'p',
                  { class: 'relic-cost', attrs: { 'data-testid': 'relic-cost' } },
                  h('span', { class: d.fragShort ? 'is-short' : '', text: `조각 ${d.fragments}/${d.cost.fragments}` }),
                  ' · ',
                  h('span', { class: d.goldShort ? 'is-short' : '', text: `골드 ${fmt(d.cost.gold)} (보유 ${fmt(m.gold)})` }),
                )
              : null,
            h(
              'div',
              { class: 'relic-actions' },
              d.isMax
                ? h('span', { class: 'relic-max', attrs: { 'data-testid': 'relic-max' }, text: '✓ 만렙이에요' })
                : d.owned
                  ? h(
                      'button',
                      {
                        class: `btn btn-primary relic-upgrade${d.fragShort || d.goldShort ? ' is-short' : ''}`,
                        attrs: { type: 'button', 'data-testid': 'relic-upgrade', ...(d.check === 'ok' ? {} : { disabled: '' }) },
                        on: {
                          click: () => {
                            const r = progress.upgradeRelic(d.id);
                            if (typeof r !== 'string') {
                              toast(`⬆ ${d.name} Lv ${r.level}!`, 1800);
                              render();
                            }
                          },
                        },
                      },
                      d.check === 'fragments' ? '조각이 모자라요' : d.check === 'gold' ? '골드가 모자라요' : '강화',
                    )
                  : null,
              h(
                'button',
                {
                  class: 'btn btn-secondary relic-set-target',
                  attrs: { type: 'button', 'data-testid': 'relic-set-target', ...(d.isTarget ? { disabled: '' } : {}) },
                  on: {
                    click: () => {
                      if (progress.setRelicTarget(d.id)) {
                        for (const k of Object.keys(spend)) delete spend[k];
                        toast(`🎯 목표: ${d.name}`, 1500);
                        render();
                      }
                    },
                  },
                },
                d.isTarget ? '🎯 목표 유물' : '목표로 지정',
              ),
            ),
          )
        : null,
      h(
        'details',
        { class: 'relic-exchange', attrs: { 'data-testid': 'relic-exchange' } },
        h('summary', { text: `조각 교환 (아무 조각 ${m.exchangeRate}개 → 목표 조각 1개)` }),
        !m.target
          ? h('p', { class: 'relic-note', text: '목표 유물을 먼저 정해 주세요.' })
          : exchangeable.length === 0
            ? h('p', { class: 'relic-note', text: '낼 수 있는 조각이 없어요 (목표 유물 조각은 낼 수 없어요).' })
            : h(
                'div',
                { class: 'relic-ex-list' },
                h('p', { class: 'relic-note', text: '낼 조각을 직접 골라요 — 자동으로 고르지 않아요.' }),
                ...exchangeable.map((c) => {
                  const n = spend[c.id] ?? 0;
                  const step = (dv: number): void => {
                    const next = Math.max(0, Math.min(c.fragments, n + dv));
                    if (next === 0) delete spend[c.id];
                    else spend[c.id] = next;
                    render();
                    (shell.body.querySelector('.relic-exchange') as HTMLDetailsElement | null)?.setAttribute('open', '');
                  };
                  return h(
                    'div',
                    { class: 'relic-ex-row', attrs: { 'data-relic': c.id } },
                    h('span', { class: 'relic-ex-name', text: `${c.name} (가진 조각 ${c.fragments})` }),
                    h('button', { class: 'btn btn-chip relic-ex-minus', attrs: { type: 'button', 'aria-label': `${c.name} 조각 하나 빼기`, ...(n <= 0 ? { disabled: '' } : {}) }, text: '−', on: { click: () => step(-1) } }),
                    h('strong', { class: 'relic-ex-n', text: String(n) }),
                    h('button', { class: 'btn btn-chip relic-ex-plus', attrs: { type: 'button', 'aria-label': `${c.name} 조각 하나 더하기`, ...(n >= c.fragments ? { disabled: '' } : {}) }, text: '+', on: { click: () => step(1) } }),
                  );
                }),
                h('p', { class: 'relic-ex-sum', attrs: { 'data-testid': 'relic-ex-sum' }, text: `낼 조각 ${exchangeTotal}개 → ${m.target.name} 조각 ${Math.floor(exchangeTotal / m.exchangeRate)}개${exchangeTotal % m.exchangeRate ? ` (${m.exchangeRate}의 배수가 아니에요)` : ''}` }),
                h(
                  'button',
                  {
                    class: 'btn btn-primary relic-ex-go',
                    attrs: { type: 'button', 'data-testid': 'relic-exchange-go', ...(exCheck === 'ok' ? {} : { disabled: '' }) },
                    on: {
                      click: () => {
                        const r = progress.exchangeRelics({ ...spend });
                        if (typeof r === 'number') {
                          for (const k of Object.keys(spend)) delete spend[k];
                          toast(`🔁 ${m.target?.name ?? ''} 조각 +${r}`, 1800);
                          render();
                        }
                      },
                    },
                  },
                  '교환',
                ),
              ),
      ),
    ];
    shell.body.replaceChildren(...parts.filter((x): x is HTMLElement => x !== null));
    if (exchangeTotal > 0) (shell.body.querySelector('.relic-exchange') as HTMLDetailsElement | null)?.setAttribute('open', '');
  }

  return {
    open(): void {
      lastFound = [];
      render();
      if (!shell.dialog.open) shell.dialog.showModal();
    },
    render(): void {
      if (shell.dialog.open) render();
    },
  };
}
