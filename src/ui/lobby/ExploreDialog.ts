/**
 * V3 P3 탐험 (docs/v3/ui-contract.md P3). 로비 대화 상자 껍데기를 받아 내용만 그린다. 머리줄 고정·본문 스크롤.
 * 탭: [탐험] 보급 상자 · 성장 선택 · 첫 영웅 선택권 · 도장 7×4 / [패스] 기본·황금 나란히 50칸 / [꾸러미] 성장 꾸러미 · 비밀 코드.
 * '오늘'·연속 출석·자정 리셋 문구를 쓰지 않는다. 자격·가격·잠금은 메타 규칙(src/meta/v3/progression.ts)에서만 읽는다.
 */
import { h } from '../dom';
import type { GameData, TowerData } from '../../data/load';
import { GRADE_RANK, GRADE_NAMES } from '../../data/grades';
import type { ProgressStore } from '../../meta/progressStore';
import { heroEntry } from '../../meta/progress';
import {
  checkGolden,
  checkHeroChoice,
  checkPackage,
  exploreReady,
  firstHeroAvailable,
  firstHeroCandidates,
  heroPackage,
  passView,
  stampView,
} from '../../meta/v3/progression';
import { rewardText } from './lobbyModel';
import { keyIcon } from './RelicDialog';

export interface ExploreDialogDeps {
  progress: ProgressStore;
  data: GameData;
  toast: (text: string, ms?: number) => void;
  /** 받은 것 보여 주기 (로비 '받았어요' 창) */
  showGrant?: (title: string, text: string) => void;
}

type Tab = 'explore' | 'pass' | 'shop';
const fmt = (n: number): string => n.toLocaleString('ko-KR');

export function mountExploreDialog(shell: { dialog: HTMLDialogElement; body: HTMLElement; title: HTMLElement }, deps: ExploreDialogDeps): { open(tab?: Tab): void; render(): void } {
  const { progress, data, toast } = deps;
  const pd = progress.pd;
  let tab: Tab = 'explore';
  let firstHero: string | null = null;
  let codeMsg = '';
  shell.dialog.classList.add('explore-dialog');

  const tabBar = (): HTMLElement =>
    h(
      'div',
      { class: 'explore-tabs', attrs: { role: 'tablist' } },
      ...(
        [
          ['explore', '탐험'],
          ['pass', '패스'],
          ['shop', '꾸러미'],
        ] as [Tab, string][]
      ).map(([k, label]) =>
        h('button', {
          class: `explore-tab${tab === k ? ' is-active' : ''}`,
          text: label,
          attrs: { type: 'button', role: 'tab', 'aria-selected': tab === k ? 'true' : 'false', 'data-tab': k, 'data-testid': `explore-tab-${k}` },
          on: {
            click: () => {
              tab = k;
              render();
            },
          },
        }),
      ),
    );

  function summary(): HTMLElement {
    const s = progress.state;
    const e = s.v3.explore;
    const sv = stampView(s.v3.stamp, pd.v3.stamp.cells);
    const pv = passView(s, pd);
    // 빨간 점과 같은 계산 (상자·도장·패스·성장 선택·첫 영웅 선택권)
    const unclaimed = exploreReady(s, pd);
    void pv;
    return h(
      'section',
      { class: 'explore-summary', attrs: { 'data-testid': 'explore-summary' } },
      h('p', { attrs: { 'data-testid': 'explore-next-choice' } }, h('strong', { text: '다음 성장 선택까지 ' }), `보급 ${pd.v3.explore.supplyPerChoice - e.choiceRest}개 · 다음 보급까지 ${pd.v3.explore.wavesPerSupply - e.supplyRest}웨이브`),
      h('p', { attrs: { 'data-testid': 'explore-stamp-progress' } }, h('strong', { text: '탐험 도장 ' }), `${sv.filled}/${pd.v3.stamp.cells} (${sv.round}회차)`),
      h('p', { attrs: { 'data-testid': 'explore-unclaimed' } }, h('strong', { text: '받지 않은 보상 ' }), unclaimed > 0 ? `${unclaimed}개` : '없음'),
      h('p', { class: 'relic-note', text: `${pd.v3.explore.minCompletedWaves}웨이브 이상 끝낸 전투마다 진행돼요. 기한은 없어요.` }),
    );
  }

  function exploreTab(): HTMLElement[] {
    const s = progress.state;
    const out: HTMLElement[] = [];
    // 보급 상자
    out.push(
      h(
        'section',
        { class: 'explore-box', attrs: { 'data-testid': 'explore-boxes' } },
        h('h3', { class: 'relic-h', text: `📦 보급 상자 ${fmt(s.v3.boxes)}개` }),
        h('p', { class: 'relic-note', text: `상자 1개 = 🗝️ 열쇠 ${pd.v3.explore.supplyReward.keys} + 목표 유물 조각 ${pd.v3.explore.supplyReward.targetFragments} (완료 ${pd.v3.explore.wavesPerSupply}웨이브마다 1개, 긴 판은 여러 개)` }),
        h(
          'button',
          {
            class: 'btn btn-primary explore-open-boxes',
            attrs: { type: 'button', 'data-testid': 'explore-open-boxes', ...(s.v3.boxes > 0 ? {} : { disabled: '' }) },
            on: {
              click: () => {
                const r = progress.openBoxes();
                if (r) {
                  const name = data.game.relics.find((x) => x.id === r.target)?.name;
                  toast(`📦 상자 ${r.boxes}개: 🗝️ +${r.keys} · ${name ? `${name} 조각` : '목표 조각(보관)'} +${r.targetFragments}`, 2400);
                  render();
                }
              },
            },
          },
          s.v3.boxes > 0 ? `모두 열기 (${s.v3.boxes}개)` : '열 상자가 없어요',
        ),
      ),
    );
    // 성장 선택
    const ready = s.v3.explore.choicesReady;
    const owned = data.towers.towers
      .filter((t) => heroEntry(s, t.id).level >= 1)
      .sort((a, b) => GRADE_RANK[b.grade] - GRADE_RANK[a.grade] || heroEntry(s, b.id).level - heroEntry(s, a.id).level || (a.id < b.id ? -1 : 1));
    const heroRow = (t: TowerData): HTMLElement => {
      const e = heroEntry(s, t.id);
      const pkg = heroPackage(s, pd, t);
      const why = checkHeroChoice(s, pd, data, t.id);
      return h(
        'div',
        { class: 'explore-choice-row', attrs: { 'data-hero': t.id } },
        h('span', { class: 'explore-choice-name' }, h('strong', { text: t.name }), h('small', { text: `${GRADE_NAMES[t.grade]} · Lv ${e.level}${pkg ? ` → ${e.level + 1}` : ' (만렙)'}` })),
        h('small', { class: 'explore-choice-pkg', text: pkg ? `${t.grade === 'hidden' ? '🧩' : '🃏'} ${pkg.cards} · 🔥 ${fmt(pkg.flame)}` : '최고 레벨이라 고를 수 없어요' }),
        h(
          'button',
          {
            class: 'btn btn-primary explore-choice-take',
            attrs: { type: 'button', 'data-testid': `explore-choice-${t.id}`, ...(why === 'ok' ? {} : { disabled: '' }), 'aria-label': `${t.name} 꾸러미 받기` },
            on: {
              click: () => {
                if (typeof progress.takeGrowthChoice({ hero: t.id }) !== 'string') {
                  toast(`🎁 ${t.name} 꾸러미 — 다음 레벨 재료를 받았어요`, 2000);
                  render();
                }
              },
            },
          },
          '받기',
        ),
      );
    };
    out.push(
      h(
        'section',
        { class: `explore-choice${ready > 0 ? ' is-ready' : ''}`, attrs: { 'data-testid': 'explore-choice' } },
        h('h3', { class: 'relic-h', text: `🎁 성장 선택 ${ready}회` }),
        h('p', { class: 'relic-note', text: `보급 ${pd.v3.explore.supplyPerChoice}개마다 1회. 영웅 꾸러미 = 그 영웅의 다음 레벨 비용(카드·불꽃)을 그대로 — 받으면 바로 1레벨 올릴 수 있어요. 또는 🗝️ 열쇠 ${pd.v3.growthChoice.relicKeys}개.` }),
        ready > 0
          ? h(
              'div',
              { class: 'explore-choice-list' },
              h(
                'div',
                { class: 'explore-choice-row explore-choice-relic' },
                h('span', { class: 'explore-choice-name' }, h('strong', { text: '유물 열쇠' }), h('small', { text: '유물 발견에 써요' })),
                h('small', { class: 'explore-choice-pkg', text: `🗝️ ${pd.v3.growthChoice.relicKeys}` }),
                h(
                  'button',
                  {
                    class: 'btn btn-secondary explore-choice-take',
                    attrs: { type: 'button', 'data-testid': 'explore-choice-relic' },
                    on: {
                      click: () => {
                        if (typeof progress.takeGrowthChoice('relic') !== 'string') {
                          toast(`🗝️ 열쇠 +${pd.v3.growthChoice.relicKeys}`, 1600);
                          render();
                        }
                      },
                    },
                  },
                  '받기',
                ),
              ),
              ...owned.map(heroRow),
            )
          : h('p', { class: 'relic-note', text: '아직 고를 수 있는 선택이 없어요.' }),
      ),
    );
    // 첫 영웅 선택권
    if (firstHeroAvailable(s)) {
      const cands = firstHeroCandidates(pd, data);
      out.push(
        h(
          'section',
          { class: 'relic-first', attrs: { 'data-testid': 'explore-first-hero' } },
          h('h3', { class: 'relic-h', text: `🎫 첫 영웅 선택권 (${GRADE_NAMES[pd.v3.firstHero.grade]} 1명)` }),
          h('p', { class: 'relic-note', text: `없는 영웅이면 바로 영입 + 카드 ${pd.v3.firstHero.newCards}장, 이미 있으면 카드 ${pd.v3.firstHero.ownedCards}장으로 받아요.` }),
          h(
            'div',
            { class: 'explore-hero-grid' },
            ...cands.map((t) =>
              h(
                'button',
                {
                  class: `explore-hero-pick${firstHero === t.id ? ' is-selected' : ''}`,
                  attrs: { type: 'button', 'data-hero': t.id, 'aria-pressed': firstHero === t.id ? 'true' : 'false' },
                  on: {
                    click: () => {
                      firstHero = t.id;
                      render();
                    },
                  },
                },
                h('strong', { text: t.name }),
                h('small', { text: heroEntry(s, t.id).level >= 1 ? `보유 → 카드 ${pd.v3.firstHero.ownedCards}장` : `영입 + 카드 ${pd.v3.firstHero.newCards}장` }),
              ),
            ),
          ),
          h(
            'button',
            {
              class: 'btn btn-primary',
              attrs: { type: 'button', 'data-testid': 'explore-first-hero-confirm', ...(firstHero ? {} : { disabled: '' }) },
              on: {
                click: () => {
                  if (!firstHero) return;
                  const r = progress.pickFirstHero(firstHero);
                  if (r) {
                    const name = data.towers.towers.find((t) => t.id === r.id)?.name ?? r.id;
                    toast(r.isNew ? `🎉 ${name} 영입! 카드 +${r.cards}` : `🃏 ${name} 카드 +${r.cards}`, 2200);
                    firstHero = null;
                    render();
                  }
                },
              },
            },
            firstHero ? `${data.towers.towers.find((t) => t.id === firstHero)?.name ?? ''} 받기` : '영웅을 골라 주세요',
          ),
        ),
      );
    }
    // 도장 7×4
    const sv = stampView(s.v3.stamp, pd.v3.stamp.cells);
    const big = new Set([7, 14, 21, 28]);
    out.push(
      h(
        'section',
        { class: 'explore-stamp', attrs: { 'data-testid': 'explore-stamp' } },
        h('h3', { class: 'relic-h', text: `🗺️ 탐험 도장 ${sv.round}회차 · ${sv.filled}/${pd.v3.stamp.cells}` }),
        h(
          'div',
          { class: 'stamp-grid', attrs: { role: 'list' } },
          ...pd.v3.stamp.rewards.map((r, i) => {
            const n = i + 1;
            const state = n <= sv.claimed ? 'claimed' : n <= sv.filled ? 'ready' : 'empty';
            return h(
              'span',
              {
                class: `stamp-cell is-${state}${big.has(n) ? ' is-big' : ''}`,
                attrs: { role: 'listitem', 'data-cell': String(n), 'aria-label': `${n}칸 · ${rewardText(r)} · ${state === 'claimed' ? '받음' : state === 'ready' ? '받을 수 있음' : '아직'}`, title: rewardText(r) },
              },
              h('b', { text: String(n) }),
              h('i', { attrs: { 'aria-hidden': 'true' }, text: state === 'claimed' ? '✓' : big.has(n) ? '★' : state === 'ready' ? '●' : '' }),
            );
          }),
        ),
        h('p', { class: 'relic-note', text: `★ 7·14·21·28칸 = 큰 보상: ${[7, 14, 21, 28].map((n) => `${n}칸 ${rewardText(pd.v3.stamp.rewards[n - 1] ?? {})}`).join(' / ')}` }),
        h(
          'button',
          {
            class: 'btn btn-primary',
            attrs: { type: 'button', 'data-testid': 'explore-stamp-claim', ...(sv.ready > 0 ? {} : { disabled: '' }) },
            on: {
              click: () => {
                const r = progress.claimStamps();
                if (r) {
                  deps.showGrant?.(`탐험 도장 ${r.cells.length}칸`, rewardText({ ...r.grant, cards: r.grant.cards.reduce((a, c) => a + c.n, 0), fragments: r.grant.fragments.reduce((a, c) => a + c.n, 0) }));
                  toast(`🗺️ 도장 ${r.cells.length}칸 받기`, 1800);
                  render();
                }
              },
            },
          },
          sv.ready > 0 ? `받기 (${sv.ready}칸)` : '받을 칸이 없어요',
        ),
      ),
    );
    return out;
  }

  function passTab(): HTMLElement[] {
    const s = progress.state;
    const pv = passView(s, pd);
    const gold = checkGolden(s, pd);
    const rows = pd.v3.pass.free.map((fr, i) => {
      const n = i + 1;
      const reached = n <= pv.reached;
      const freeState = n <= pv.freeClaimed ? 'claimed' : reached ? 'ready' : 'locked';
      const goldState = !pv.golden ? (reached ? 'locked-gold' : 'locked') : n <= pv.goldenClaimed ? 'claimed' : reached ? 'ready' : 'locked';
      const mark = (st: string): string => (st === 'claimed' ? '✓ ' : st === 'ready' ? '● ' : '🔒 ');
      return h(
        'div',
        { class: `pass-row${n === pv.reached || (pv.reached === 0 && n === 1) ? ' is-current' : ''}`, attrs: { 'data-cell': String(n) } },
        h('b', { class: 'pass-n', text: String(n) }),
        h('span', { class: `pass-reward is-${freeState}` }, mark(freeState), rewardText(fr)),
        h('span', { class: `pass-reward pass-gold is-${goldState}` }, mark(goldState === 'locked-gold' ? 'locked' : goldState), rewardText(pd.v3.pass.golden[i] ?? {})),
      );
    });
    const list = h('div', { class: 'pass-list', attrs: { 'data-testid': 'pass-list' } }, h('div', { class: 'pass-row pass-head' }, h('b', { text: '칸' }), h('span', { text: '기본 (무료)' }), h('span', { text: '✨ 황금' })), ...rows);
    return [
      h(
        'section',
        { class: 'explore-summary', attrs: { 'data-testid': 'pass-summary' } },
        h('p', {}, h('strong', { text: `시즌 ${pv.season} ` }), `${pv.reached}/${pv.cells}칸 · ${pv.complete ? '시즌 완료!' : `다음 칸까지 ${pv.toNext}웨이브`}`),
        h('p', { class: 'relic-note', text: `${pd.v3.explore.minCompletedWaves}웨이브 이상 끝낸 전투의 완료 웨이브 ${pd.v3.pass.wavesPerCell}마다 1칸. 날짜·기한이 없어요.` }),
        h(
          'div',
          { class: 'relic-actions' },
          h(
            'button',
            {
              class: 'btn btn-primary',
              attrs: { type: 'button', 'data-testid': 'pass-claim', ...(pv.ready > 0 ? {} : { disabled: '' }) },
              on: {
                click: () => {
                  const r = progress.claimPass();
                  if (r) {
                    toast(`🎫 패스 ${r.free.length + r.golden.length}칸 받기`, 1800);
                    render();
                  }
                },
              },
            },
            pv.ready > 0 ? `받기 (${pv.ready})` : '받을 칸 없음',
          ),
          h(
            'button',
            {
              class: 'btn btn-secondary',
              attrs: { type: 'button', 'data-testid': 'pass-jump' },
              on: {
                click: () => {
                  const target = list.querySelector(`.pass-row[data-cell="${Math.max(1, pv.reached)}"]`) as HTMLElement | null;
                  target?.scrollIntoView({ block: 'center' });
                },
              },
            },
            '현재 칸으로',
          ),
        ),
        pv.complete
          ? h(
              'button',
              {
                class: 'btn btn-primary',
                attrs: { type: 'button', 'data-testid': 'pass-next-season' },
                on: {
                  click: () => {
                    const r = progress.nextPassSeason();
                    if (r) {
                      toast(`🎫 시즌 ${r.season} 시작${r.grant ? ' — 받지 않은 칸을 먼저 받았어요' : ''}`, 2200);
                      render();
                    }
                  },
                },
              },
              `다음 시즌으로 (받지 않은 칸은 먼저 받아요)`,
            )
          : null,
      ),
      h(
        'section',
        { class: `pass-golden${pv.golden ? ' is-owned' : ''}`, attrs: { 'data-testid': 'pass-golden' } },
        h('h3', { class: 'relic-h', text: pv.golden ? '✨ 황금 트랙 열림 (이번 시즌)' : `✨ 황금 트랙 — 💎 ${fmt(pv.price)} (선택)` }),
        h('p', { class: 'relic-note', text: `황금 칸 합계: ${rewardText(sumRewards(pd.v3.pass.golden))}. 사기 전에 지난 칸도 바로 받을 수 있어요(소급). 핵심 성장 재료는 기본 트랙·보급에서도 얻어요.` }),
        pv.golden
          ? null
          : h(
              'button',
              {
                class: `btn btn-secondary${gold === 'gems' ? ' is-short' : ''}`,
                attrs: { type: 'button', 'data-testid': 'pass-buy-golden', ...(gold === 'ok' ? {} : { disabled: '' }) },
                on: {
                  click: () => {
                    if (progress.buyGolden() === 'ok') {
                      toast('✨ 황금 트랙을 열었어요 — 지난 칸도 받을 수 있어요', 2200);
                      render();
                    }
                  },
                },
              },
              gold === 'gems' ? `보석이 모자라요 (💎 ${fmt(s.gems)}/${fmt(pv.price)})` : `💎 ${fmt(pv.price)}로 열기`,
            ),
      ),
      list,
    ];
  }

  function shopTab(): HTMLElement[] {
    const s = progress.state;
    let input: HTMLInputElement;
    return [
      h(
        'section',
        { class: 'explore-packages', attrs: { 'data-testid': 'explore-packages' } },
        h('h3', { class: 'relic-h', text: '🎒 성장 꾸러미 (계정 레벨마다 1번)' }),
        ...pd.v3.packages.map((p) => {
          const why = checkPackage(s, pd, p.id);
          const price = p.price.gold !== undefined ? `💰 ${fmt(p.price.gold)}` : `💎 ${fmt(p.price.gems ?? 0)}`;
          return h(
            'div',
            { class: `explore-pkg is-${why}`, attrs: { 'data-pkg': p.id } },
            h('span', { class: 'explore-choice-name' }, h('strong', { text: p.name }), h('small', { text: `계정 Lv ${p.unlockLevel} · ${rewardText(p.reward)}` })),
            why === 'bought'
              ? h('span', { class: 'relic-max', text: '✓ 구매함' })
              : h(
                  'button',
                  {
                    class: `btn btn-primary${why === 'gold' || why === 'gems' ? ' is-short' : ''}`,
                    attrs: { type: 'button', 'data-testid': `explore-buy-${p.id}`, ...(why === 'ok' ? {} : { disabled: '' }) },
                    on: {
                      click: () => {
                        if (typeof progress.buyPackage(p.id) !== 'string') {
                          toast(`🎒 ${p.name} 구매!`, 1800);
                          render();
                        }
                      },
                    },
                  },
                  why === 'locked' ? `🔒 Lv ${p.unlockLevel} 필요` : why === 'gold' ? `골드 모자람 (${price})` : why === 'gems' ? `보석 모자람 (${price})` : price,
                ),
          );
        }),
      ),
      h(
        'section',
        { class: 'explore-code', attrs: { 'data-testid': 'explore-code' } },
        h('h3', { class: 'relic-h', text: '🔑 비밀 코드' }),
        h(
          'div',
          { class: 'explore-code-row' },
          (input = h('input', { class: 'explore-code-input', attrs: { type: 'text', 'aria-label': '비밀 코드', autocomplete: 'off', 'data-testid': 'explore-code-input', maxlength: '32' } })),
          h(
            'button',
            {
              class: 'btn btn-primary',
              attrs: { type: 'button', 'data-testid': 'explore-code-go' },
              on: {
                click: () => {
                  const r = progress.redeemCode(input.value);
                  codeMsg = r === 'invalid' ? '맞지 않는 코드예요' : r === 'used' ? '이미 받은 코드예요' : `받았어요: ${rewardText({ ...r, cards: r.cards.reduce((a, c) => a + c.n, 0), fragments: r.fragments.reduce((a, c) => a + c.n, 0) })}`;
                  render();
                },
              },
            },
            '입력',
          ),
        ),
        codeMsg ? h('p', { class: 'relic-note', attrs: { 'data-testid': 'explore-code-msg', role: 'status' }, text: codeMsg }) : null,
      ),
    ];
  }

  function render(): void {
    const parts = [tabBar(), summary(), ...(tab === 'explore' ? exploreTab() : tab === 'pass' ? passTab() : shopTab())];
    shell.body.replaceChildren(...parts);
    shell.dialog.dataset.tab = tab;
  }

  void keyIcon;
  return {
    open(t?: Tab): void {
      if (t) tab = t;
      codeMsg = '';
      render();
      if (!shell.dialog.open) shell.dialog.showModal();
    },
    render(): void {
      if (shell.dialog.open) render();
    },
  };
}

function sumRewards(list: readonly { gold?: number; gems?: number; flame?: number; cards?: number; fragments?: number; keys?: number }[]) {
  const t = { gold: 0, gems: 0, flame: 0, cards: 0, fragments: 0, keys: 0 };
  for (const r of list) {
    t.gold += r.gold ?? 0;
    t.gems += r.gems ?? 0;
    t.flame += r.flame ?? 0;
    t.cards += r.cards ?? 0;
    t.fragments += r.fragments ?? 0;
    t.keys += r.keys ?? 0;
  }
  return t;
}
