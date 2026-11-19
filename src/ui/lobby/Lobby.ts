/**
 * 로비 (G-3, docs/UI.md 12장): 부팅 뒤 첫 화면 — 예전 타이틀 자리 (타이틀 그림은 Phaser Boot 장면이 뒤에 그대로 깐다).
 *
 * 구성
 *  - 위 띠: 계정 문장 + Lv + 경험치 바, 💰 골드, 💎 보석(게임 안에서만 얻음), 🔥 불꽃(V2.0 PR-A, 영웅 레벨업에만). ⚙ 설정은 위 띠가 아니라 전투 탭 오른쪽 줄
 *  - 가운데: 탭 화면 (아래 메뉴로 바꿈)
 *    · [전투] (기본): 로고, 왼쪽 [퀘스트]·[영웅 모집], 오른쪽 [📜 기록]·[⚙], 세로 '웨이브 길'(최고 웨이브 + 10웨이브마다 보상),
 *      큰 [빠른 시작](무한 모드) — 이어 할 판이 있으면 [이어 하기 · n단계] + [새 게임](확인 창)
 *    · [영웅]: 영웅 카드 격자 (탭 [영웅]/[리미티드], [⬆ 모두 레벨업 N], 정렬 [등급 순]/[레벨 순]/[레벨업 가능]), 누르면 상세 창(능력치·특색·레벨업)
 *    · [상점]: 게임 안 화폐로 카드 묶음·상자·조각·골드 (실제 돈 상품 없음)
 *    · [도감]: 리미티드(히든) 영웅 조각 모으기 + 해방, 조합 재료
 *    · [캠페인]: 계정 레벨로 열리는 모드 자리 (열리면 테마 1)
 *  - 아래 메뉴 5칸: 상점 · 영웅 · 전투 · 도감 · 캠페인 (320px에서도 한 줄)
 *
 * 창은 모두 <dialog> → 안드로이드 뒤로 가기는 nativeBack이 맨 위 창부터 닫고, 그다음 `back()`이 [전투] 탭으로, 그다음 앱 종료.
 * 예전 타이틀 선택자(`data-screen="title"`, `data-action="start"`·`resume-match`·`new-game`·`campaign`·`records`)는 그대로 둔다
 * — E2E 도우미(e2e/title.ts clickStart)·기존 스펙이 같은 버튼을 누른다.
 * 화면은 저장소(ProgressStore)의 동작을 부르고, 바뀌면 구독으로 다시 그린다. sim은 건드리지 않는다.
 */
import { h } from '../dom';
import { GRADE_NAMES } from '../../data/grades';
import { artIcon } from '../artIcon';
import type { UiArt } from '../../art/uiIcons';
import type { UiView } from '../root';
import type { GameData } from '../../data/load';
import type { ProgressStore } from '../../meta/progressStore';
import { achievementQuests, claimableQuests, dailyBonusReady, dailyQuests, modeUnlocked, type Grant, type QuestView } from '../../meta/progress';
import { createRecordsDialog, type BattleRecordsView } from '../screens/BattleRecordsDialog';
import { feedbackButton, type FeedbackDialogView } from '../screens/FeedbackDialog';
import {
  fragmentRows,
  grantLine,
  grantView,
  heroDetail,
  heroGrid,
  heroesReady,
  codexReady,
  rewardText,
  topBar,
  waveRoad,
  type GrantView,
  type HeroCardModel,
  type HeroSort,
  type HeroTab,
} from './lobbyModel';

export type LobbyTab = 'shop' | 'heroes' | 'battle' | 'codex' | 'locked';
export const LOBBY_TABS: readonly LobbyTab[] = ['shop', 'heroes', 'battle', 'codex', 'locked'];

export interface LobbySavedMatch {
  stage: string;
  dev: boolean;
  onResume: () => void;
}

export interface LobbySettings {
  effectVolume: number;
  onEffectVolume: (v: number) => void;
  onPreviewAudio?: () => void;
  screenShake: boolean;
  onScreenShake: (on: boolean) => void;
  tapMerge: boolean;
  onTapMerge: (on: boolean) => void;
  /** 💬 피드백 보내기 창 (FB-1) — 설정 창에 [💬 피드백 보내기] 버튼, 창은 로비 끝에 붙인다 */
  feedback?: FeedbackDialogView;
}

export interface LobbyOptions {
  version: string;
  data: GameData;
  progress: ProgressStore;
  keyArt?: boolean;
  /** [빠른 시작] → 무한 모드 */
  onStart: () => void;
  /** 캠페인 테마 1 (캠페인 탭이 열렸을 때 · 개발자 [캠페인 1]) */
  onCampaign: () => void;
  /** 개발자 모드: [캠페인 1 (디버그)]·[🛠 +재화] */
  debug?: boolean;
  saved?: LobbySavedMatch;
  records?: BattleRecordsView;
  settings?: LobbySettings;
  /** 영웅 초상 그림 주소 (없으면 null → 이름 글자 머리) */
  portraitOf: (towerId: string) => string | null;
  toast: (text: string, ms?: number) => void;
  /** 처음 열 탭 (기본 전투) */
  tab?: LobbyTab;
}

export interface LobbyView extends UiView {
  tab(): LobbyTab;
  select(tab: LobbyTab): void;
  /** 안드로이드 뒤로 가기 (열린 창은 nativeBack이 먼저 닫는다): 전투 탭이 아니면 전투로 → true, 전투 탭이면 false(앱 종료) */
  back(): boolean;
}

const NAV: Record<LobbyTab, { icon: string; label: string }> = {
  shop: { icon: '🛒', label: '상점' },
  heroes: { icon: '🦸', label: '영웅' },
  battle: { icon: '⚔️', label: '전투' },
  codex: { icon: '📖', label: '도감' },
  locked: { icon: '🔒', label: '캠페인' },
};

const fmt = (n: number): string => n.toLocaleString('ko-KR');

function dialogShell(id: string, title: string, testid: string, ...body: (Node | null)[]): { dialog: HTMLDialogElement; body: HTMLElement; title: HTMLElement } {
  const close = h('button', { class: 'btn lobby-close', text: '닫기', attrs: { type: 'button', 'data-testid': `${testid}-close` } });
  const titleEl = h('h2', { attrs: { id }, text: title });
  const content = h('div', { class: 'lobby-dialog-body' }, ...body);
  const dialog = h('dialog', { class: 'title-dialog lobby-dialog', attrs: { 'aria-labelledby': id, 'data-testid': testid } }, h('header', { class: 'lobby-dialog-head' }, titleEl, close), content);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  return { dialog, body: content, title: titleEl };
}

function badge(n: number): HTMLElement | null {
  return n > 0 ? h('span', { class: 'lobby-badge', text: n > 9 ? '9+' : String(n), attrs: { 'aria-hidden': 'true' } }) : null;
}

export function createLobbyScreen(opts: LobbyOptions): LobbyView {
  const { data, progress } = opts;
  const pd = progress.pd;
  progress.refresh();
  let tab: LobbyTab = opts.tab ?? 'battle';
  let heroTab: HeroTab = 'heroes';
  let heroSort: HeroSort = 'grade';
  let detailId: string | null = null;
  let questTab: 'daily' | 'achievements' = 'daily';
  const startButtons: HTMLButtonElement[] = [];
  const lockAll = (): void => {
    for (const b of startButtons) b.disabled = true;
  };

  // ---------- 창들 ----------
  const grantDlg = dialogShell('lobby-grant-title', '받았어요', 'grant-dialog');
  const detailDlg = dialogShell('hero-detail-title', '영웅', 'hero-detail');
  detailDlg.dialog.classList.add('hero-detail-dialog');
  detailDlg.dialog.addEventListener('close', () => {
    detailId = null;
  });
  const questDlg = dialogShell('quest-title', '퀘스트', 'quest-dialog');
  const recruitDlg = dialogShell('recruit-title', '영웅 모집', 'recruit-dialog');
  const settingsDlg = opts.settings ? dialogShell('lobby-settings-title', '설정', 'settings-dialog') : null;
  const recordsDialog = opts.records ? createRecordsDialog(opts.records) : null;

  function portrait(id: string, name: string, cls = 'hero-portrait'): HTMLElement {
    const url = opts.portraitOf(id);
    if (url) return h('img', { class: cls, attrs: { src: url, alt: '', loading: 'lazy', draggable: 'false' } });
    return h('span', { class: `${cls} is-text`, text: name.slice(0, 1), attrs: { 'aria-hidden': 'true' } });
  }

  function showGrant(title: string, g: Grant | null): void {
    if (!g) return;
    const v = grantView(g, data);
    grantDlg.title.textContent = title;
    grantDlg.body.replaceChildren(grantBody(v));
    if (!grantDlg.dialog.open) grantDlg.dialog.showModal();
    // 화면 읽기 프로그램용 한 줄 (창이 알림 층을 덮으므로 보이는 알림은 띄우지 않는다)
    grantDlg.dialog.setAttribute('aria-description', grantLine(v));
  }

  function grantBody(v: GrantView): HTMLElement {
    const chips: HTMLElement[] = [];
    if (v.gold) chips.push(h('span', { class: 'go-chip', text: `💰 +${fmt(v.gold)}` }));
    if (v.gems) chips.push(h('span', { class: 'go-chip', text: `💎 +${fmt(v.gems)}` }));
    if (v.flame) chips.push(h('span', { class: 'go-chip', text: `🔥 +${fmt(v.flame)}` }));
    if (v.xp) chips.push(h('span', { class: 'go-chip', text: `⭐ +${fmt(v.xp)}` }));
    if (v.levelUps.length) chips.push(h('span', { class: 'go-chip', text: `계정 Lv ${v.levelUps[v.levelUps.length - 1]}` }));
    return h(
      'div',
      { class: 'grant-body', attrs: { 'data-testid': 'grant-body' } },
      chips.length ? h('div', { class: 'go-chips' }, ...chips) : null,
      v.cards.length
        ? h(
            'div',
            { class: 'grant-cards' },
            ...v.cards.map((c) =>
              h(
                'div',
                { class: 'grant-card', attrs: { style: `--grade-color:${c.color}`, 'data-hero': c.id } },
                portrait(c.id, c.name, 'grant-portrait'),
                h('span', { class: 'grant-name', text: c.name }),
                h('span', { class: 'grant-n', text: `×${c.n}` }),
                c.isNew ? h('span', { class: 'go-card-new', text: 'NEW' }) : null,
              ),
            ),
          )
        : null,
      v.fragments.length ? h('p', { class: 'grant-frags', text: `🧩 ${v.fragments.map((f) => `${f.name} +${f.n}`).join(' · ')}` }) : null,
    );
  }

  // ---------- 위 띠 ----------
  const top = h('header', { class: 'lobby-top', attrs: { 'data-testid': 'lobby-top' } });
  function renderTop(): void {
    const t = topBar(progress.state, pd);
    top.replaceChildren(
      h(
        'div',
        { class: 'lobby-profile', attrs: { 'data-testid': 'lobby-profile', 'aria-label': `계정 레벨 ${t.level}, 경험치 ${t.xp}/${t.xpNeed}` } },
        h('span', { class: 'lobby-avatar', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'lobby-avatar-lv', text: String(t.level) })),
        h(
          'span',
          { class: 'lobby-xp' },
          h('span', { class: 'lobby-xp-text', text: `Lv ${t.level}`, attrs: { 'data-testid': 'lobby-level' } }),
          h('span', { class: 'lobby-xpbar' }, h('span', { class: 'lobby-xpfill', attrs: { style: `width:${Math.round(t.xpRatio * 100)}%` } })),
          h('span', { class: 'lobby-xp-num', text: `${fmt(t.xp)}/${fmt(t.xpNeed)}` }),
        ),
      ),
      h(
        'div',
        { class: 'lobby-wallet' },
        h('span', { class: 'lobby-coin', attrs: { 'data-testid': 'lobby-gold', 'aria-label': `골드 ${t.gold}` } }, h('span', { class: 'lobby-coin-icon', text: '💰', attrs: { 'aria-hidden': 'true' } }), fmt(t.gold)),
        h('span', { class: 'lobby-coin is-gem', attrs: { 'data-testid': 'lobby-gems', 'aria-label': `보석 ${t.gems}` } }, h('span', { class: 'lobby-coin-icon', text: '💎', attrs: { 'aria-hidden': 'true' } }), fmt(t.gems)),
        // V2.0 PR-A 🔥 불꽃: 영웅 레벨업에만 쓴다
        h('span', { class: 'lobby-coin is-flame', attrs: { 'data-testid': 'lobby-flame', 'aria-label': `불꽃 ${t.flame}` } }, h('span', { class: 'lobby-coin-icon', text: '🔥', attrs: { 'aria-hidden': 'true' } }), fmt(t.flame)),
      ),
    );
  }

  // ---------- 전투 탭 ----------
  let confirmNew: HTMLDialogElement | null = null;
  const saved = opts.saved;
  if (saved) {
    const cancel = h('button', { class: 'btn', text: '취소', attrs: { type: 'button', 'data-testid': 'new-game-cancel' } });
    const ok = h('button', { class: 'btn btn-primary', text: '새 게임 시작', attrs: { type: 'button', 'data-testid': 'new-game-ok' } });
    confirmNew = h(
      'dialog',
      { class: 'title-dialog title-confirm', attrs: { 'aria-labelledby': 'new-game-title', 'data-testid': 'new-game-dialog' } },
      h(
        'div',
        { class: 'title-dialog-body' },
        h('h2', { attrs: { id: 'new-game-title' }, text: '새 게임을 시작할까요?' }),
        h('p', { text: `이어 하던 판(${saved.stage})은 지워져요.` }),
        h('div', { class: 'title-confirm-actions' }, cancel, ok),
      ),
    );
    const dialog = confirmNew;
    cancel.addEventListener('click', () => dialog.close());
    ok.addEventListener('click', () => {
      if (ok.disabled) return;
      ok.disabled = true;
      lockAll();
      dialog.close();
      opts.onStart();
    });
  }

  const start = saved
    ? h(
        'button',
        {
          class: 'btn btn-primary btn-start btn-resume lobby-start',
          attrs: { type: 'button', 'data-action': 'resume-match', 'aria-label': `이어 하기 ${saved.stage}${saved.dev ? ' (개발자 판)' : ''}` },
          on: {
            click: () => {
              lockAll();
              saved.onResume();
            },
          },
        },
        h('span', { class: 'btn-icon', text: '▶', attrs: { 'aria-hidden': 'true' } }),
        h('span', { text: '이어 하기' }),
        h('small', { class: 'title-save-stage', text: saved.stage }),
        saved.dev ? h('small', { class: 'title-save-dev', text: '🛠 개발자 판' }) : null,
      )
    : h(
        'button',
        {
          class: 'btn btn-primary btn-start lobby-start',
          attrs: { type: 'button', 'data-action': 'start', 'aria-label': '빠른 시작' },
          on: {
            click: () => {
              lockAll();
              opts.onStart();
            },
          },
        },
        h('span', { class: 'btn-icon', text: '▶', attrs: { 'aria-hidden': 'true' } }),
        h('span', { text: '빠른 시작' }),
      );
  startButtons.push(start);
  const below: HTMLButtonElement[] = [];
  if (confirmNew) {
    const b = h('button', {
      class: 'btn btn-campaign btn-new-game',
      text: '새 게임',
      attrs: { type: 'button', 'data-action': 'new-game', 'aria-haspopup': 'dialog' },
      on: { click: () => confirmNew?.showModal() },
    });
    below.push(b);
    startButtons.push(b);
  }
  if (opts.debug) {
    const b = h(
      'button',
      {
        class: 'btn btn-campaign',
        attrs: { type: 'button', 'data-action': 'campaign', 'aria-label': '캠페인 1 (디버그)' },
        on: {
          click: () => {
            lockAll();
            opts.onCampaign();
          },
        },
      },
      h('span', { class: 'btn-icon', text: '🏰', attrs: { 'aria-hidden': 'true' } }),
      h('span', { text: '캠페인 1 (디버그)' }),
    );
    below.push(b);
    startButtons.push(b);
  }

  const nextHint = h('p', { class: 'lobby-next', attrs: { 'data-testid': 'wave-next' } });
  const road = h('div', { class: 'wave-road', attrs: { 'data-testid': 'wave-road', role: 'list', 'aria-label': '웨이브 길' } });
  const bestLabel = h('div', { class: 'wave-best', attrs: { 'data-testid': 'wave-best' } });
  const side = h('div', { class: 'lobby-side lobby-side-left' });
  const sideR = h('div', { class: 'lobby-side lobby-side-right' });

  function renderRoad(): void {
    const m = waveRoad(progress.state, pd);
    bestLabel.replaceChildren(h('span', { class: 'wave-best-label', text: '최고 웨이브' }), h('strong', { text: String(m.best) }));
    const nextNode = m.nodes.find((n) => n.wave === m.next);
    nextHint.textContent = m.ready > 0 ? `받을 웨이브 보상 ${m.ready}개!` : nextNode ? `다음 보상 ${nextNode.wave}웨이브 · ${nextNode.reward}` : '웨이브 길 보상을 모두 받았어요';
    const nodes = [...m.nodes].reverse();
    const out: HTMLElement[] = [];
    for (const n of nodes) {
      const passed = m.best >= n.wave;
      let action: HTMLElement;
      if (n.state === 'ready') {
        action = h('button', {
          class: 'btn btn-primary wave-claim',
          text: '받기',
          attrs: { type: 'button', 'data-testid': `wave-claim-${n.wave}`, 'aria-label': m.ready > 1 ? `웨이브 보상 ${m.ready}개 모두 받기` : `${n.wave}웨이브 보상 받기` },
          // 피드백 #57: [받기] 하나로 받을 수 있는 웨이브 보상을 모두 받는다
          on: {
            click: () => {
              const r = progress.claimAllMilestones();
              showGrant(r && r.waves.length > 1 ? `웨이브 보상 ${r.waves.length}개` : `${r?.waves[0] ?? n.wave}웨이브 보상`, r?.grant ?? null);
            },
          },
        });
      } else if (n.state === 'claimed') action = h('span', { class: 'wave-done', text: '✓ 받음' });
      else action = h('span', { class: 'wave-lock', text: '🔒' });
      out.push(
        h(
          'div',
          { class: `wave-node is-${n.state}${passed ? ' is-passed' : ''}`, attrs: { role: 'listitem', 'data-wave': String(n.wave) } },
          h('span', { class: 'wave-num', text: String(n.wave) }),
          h('span', { class: 'wave-reward', text: n.reward }),
          action,
        ),
      );
      // 지금 최고 기록 위치 표시 (이 이정표 아래·다음 이정표 위)
      const lowerWave = nodes[nodes.indexOf(n) + 1]?.wave ?? 0;
      if (m.best < n.wave && m.best >= lowerWave) out.push(h('div', { class: 'wave-here', attrs: { 'data-testid': 'wave-here', role: 'listitem' } }, h('span', { text: `▲ 지금 ${m.best}웨이브` })));
    }
    road.replaceChildren(...out);
    // 지금 위치가 보이게
    queueMicrotask(() => {
      // 무대(#stage)·페이지는 움직이지 않게 길 상자만 (scrollIntoView는 바깥까지 굴린다)
      const here = road.querySelector<HTMLElement>('.is-ready') ?? road.querySelector<HTMLElement>('.wave-here');
      if (here) road.scrollTop = Math.max(0, here.offsetTop - road.clientHeight / 2 + here.offsetHeight / 2);
    });
  }

  function renderSide(): void {
    const s = progress.state;
    const quests = claimableQuests(s, pd, progress.today());
    const recruitPct = Math.min(100, Math.round((s.recruit / pd.recruit.goal) * 100));
    side.replaceChildren(
      h(
        'button',
        { class: 'btn lobby-side-btn', attrs: { type: 'button', 'data-action': 'quests', 'aria-haspopup': 'dialog', 'aria-label': '퀘스트' }, on: { click: () => openQuests() } },
        h('span', { class: 'lobby-side-icon', text: '📜', attrs: { 'aria-hidden': 'true' } }),
        h('span', { text: '퀘스트' }),
        badge(quests),
      ),
      h(
        'button',
        { class: 'btn lobby-side-btn', attrs: { type: 'button', 'data-action': 'recruit', 'aria-haspopup': 'dialog', 'aria-label': `영웅 모집 ${s.recruit}/${pd.recruit.goal}` }, on: { click: () => openRecruit() } },
        h('span', { class: 'lobby-side-icon', text: '🎺', attrs: { 'aria-hidden': 'true' } }),
        h('span', { text: '영웅 모집' }),
        h('span', { class: 'lobby-gauge', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'lobby-gauge-fill', attrs: { style: `width:${recruitPct}%` } })),
        h('small', { class: 'lobby-gauge-text', text: `${Math.min(s.recruit, pd.recruit.goal)}/${pd.recruit.goal}`, attrs: { 'data-testid': 'recruit-gauge' } }),
        badge(s.recruit >= pd.recruit.goal ? 1 : 0),
      ),
    );
    const rightKids: HTMLElement[] = [];
    if (recordsDialog) {
      rightKids.push(
        h(
          'button',
          { class: 'btn lobby-side-btn', attrs: { type: 'button', 'data-action': 'records', 'aria-haspopup': 'dialog', 'aria-label': '기록' }, on: { click: () => recordsDialog.showModal() } },
          h('span', { class: 'lobby-side-icon', text: '🏆', attrs: { 'aria-hidden': 'true' } }),
          h('span', { text: '기록' }),
        ),
      );
    }
    if (settingsDlg) {
      rightKids.push(
        h(
          'button',
          { class: 'btn lobby-side-btn', attrs: { type: 'button', 'data-action': 'settings', 'aria-haspopup': 'dialog', 'aria-label': '설정' }, on: { click: () => settingsDlg.dialog.showModal() } },
          h('span', { class: 'lobby-side-icon', text: '⚙️', attrs: { 'aria-hidden': 'true' } }),
          h('span', { text: '설정' }),
        ),
      );
    }
    if (opts.debug) {
      rightKids.push(
        h(
          'button',
          { class: 'btn lobby-side-btn', attrs: { type: 'button', 'data-action': 'dev-grant', 'aria-label': '개발자 재화 추가' }, on: { click: () => progress.devGrant() } },
          h('span', { class: 'lobby-side-icon', text: '🛠', attrs: { 'aria-hidden': 'true' } }),
          h('span', { text: '+재화' }),
        ),
      );
    }
    sideR.replaceChildren(...rightKids);
  }

  const battlePanel = h(
    'section',
    { class: 'lobby-panel lobby-battle', attrs: { 'data-panel': 'battle', 'aria-label': '전투' } },
    h(
      'div',
      { class: 'title-logo lobby-logo' },
      h('span', { class: 'title-crest', attrs: { 'aria-hidden': 'true' } }),
      h('h1', { class: 'title-name', text: '운빨 디펜스' }),
      h('span', { class: 'title-crest title-crest-right', attrs: { 'aria-hidden': 'true' } }),
    ),
    h('div', { class: 'lobby-middle' }, side, h('div', { class: 'wave-column' }, bestLabel, road), sideR),
    // [빠른 시작] 아래 한 줄은 늘 같은 높이 → [새 게임]·[캠페인 1(디버그)]이 있어도 [빠른 시작] 자리가 같다 (없으면 다음 웨이브 보상 안내)
    h('div', { class: 'title-actions lobby-actions' }, start, h('div', { class: `title-debug lobby-below${below.length > 1 ? ' is-pair' : ''}` }, ...(below.length > 0 ? below : [nextHint]))),
  );

  // ---------- 영웅 탭 ----------
  const heroesPanel = h('section', { class: 'lobby-panel lobby-heroes', attrs: { 'data-panel': 'heroes', 'aria-label': '영웅' } });

  function heroCardEl(c: HeroCardModel): HTMLElement {
    const label = `${c.name} ${c.gradeName}${c.owned ? ` Lv ${c.level}` : c.locked ? ' 잠김' : ' 보유하지 않음'}`;
    return h(
      'button',
      {
        class: `hero-card grade-${c.grade}${c.owned ? '' : ' is-unowned'}${c.ready ? ' is-ready' : ''}${c.locked ? ' is-locked' : ''}`,
        attrs: { type: 'button', style: `--grade-color:${c.color}`, 'data-hero': c.id, 'data-grade': c.grade, 'data-level': String(c.level), 'aria-label': label },
        on: { click: () => openDetail(c.id) },
      },
      h('span', { class: 'hero-card-art' }, portrait(c.id, c.name), c.ready ? h('span', { class: 'hero-up', text: '▲', attrs: { 'aria-hidden': 'true', 'data-testid': 'hero-up' } }) : null),
      h('span', { class: 'hero-card-lv', text: c.owned ? `Lv ${c.level}` : c.locked ? '🔒' : '—' }),
      h('span', { class: 'hero-card-name', text: c.name }),
      h(
        'span',
        { class: 'hero-card-count' },
        h('span', { class: 'hero-card-bar', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'hero-card-fill', attrs: { style: `width:${c.need ? Math.min(100, Math.round((c.cards / c.need) * 100)) : 100}%` } })),
        h('span', { class: 'hero-card-num', text: c.max ? 'MAX' : c.need !== null ? `${c.cards}/${c.need}` : `${c.cards}` }),
      ),
    );
  }

  function renderHeroes(): void {
    const g = heroGrid(progress.state, pd, data, heroTab, heroSort);
    const tabBtn = (id: HeroTab, label: string): HTMLElement =>
      h('button', {
        class: `btn btn-chip lobby-seg${heroTab === id ? ' is-on' : ''}`,
        text: label,
        attrs: { type: 'button', 'aria-pressed': String(heroTab === id), 'data-hero-tab': id },
        on: {
          click: () => {
            heroTab = id;
            renderHeroes();
          },
        },
      });
    const sortBtn = (id: HeroSort, label: string): HTMLElement =>
      h('button', {
        class: `btn btn-chip lobby-seg${heroSort === id ? ' is-on' : ''}`,
        text: label,
        attrs: { type: 'button', 'aria-pressed': String(heroSort === id), 'data-sort': id },
        on: {
          click: () => {
            heroSort = id;
            renderHeroes();
          },
        },
      });
    // 피드백 #31: 지금 탭의 보유 영웅을 보이는 순서대로 모두 레벨업 (돌아가며 한 레벨씩)
    const levelAll = h('button', {
      class: `btn btn-chip ${g.canLevel > 0 ? 'btn-primary' : ''} hero-levelup-all`,
      text: g.canLevel > 0 ? `⬆ 모두 레벨업 ${g.canLevel}` : '⬆ 모두 레벨업',
      attrs: { type: 'button', 'data-testid': 'hero-levelup-all', ...(g.canLevel > 0 ? {} : { disabled: '' }) },
      on: {
        click: () => {
          const r = progress.levelUpAll(g.owned.map((c) => c.id));
          if (r.ups.length > 0) opts.toast(`⬆ 영웅 ${r.ups.length}명 레벨업 · 🃏 ${r.cards} · 🔥 ${fmt(r.flame)} 사용`, 2200);
        },
      },
    });
    heroesPanel.replaceChildren(
      h('div', { class: 'lobby-panel-head' }, h('h2', { class: 'lobby-panel-title', text: '영웅 수집' }), h('div', { class: 'lobby-segs' }, tabBtn('heroes', '영웅'), tabBtn('mythic', `신·${GRADE_NAMES.hidden}`))),
      h('div', { class: 'lobby-sortbar' }, h('span', { class: 'lobby-count', text: `보유 ${g.owned.length}/${g.owned.length + g.unowned.length}` }), levelAll),
      h('div', { class: 'lobby-sortbar hero-sorts' }, h('div', { class: 'lobby-segs' }, sortBtn('grade', '등급 순'), sortBtn('level', '레벨 순'), sortBtn('ready', '레벨업 가능'))),
      h(
        'div',
        { class: 'lobby-scroll' },
        h('div', { class: 'hero-grid', attrs: { 'data-testid': 'hero-grid-owned' } }, ...g.owned.map(heroCardEl)),
        g.unowned.length > 0
          ? h(
              'div',
              { class: 'hero-unowned' },
              h('h3', { class: 'hero-section-title', text: heroTab === 'mythic' ? '잠김 · 보유하지 않음' : '보유하지 않음' }),
              h('div', { class: 'hero-grid', attrs: { 'data-testid': 'hero-grid-unowned' } }, ...g.unowned.map(heroCardEl)),
            )
          : null,
        h('p', { class: 'lobby-note', text: '영웅 레벨이 오르면 전투에서 그 영웅의 공격력이 올라요. 카드는 전투 보상·상점·퀘스트에서 얻어요.' }),
      ),
    );
  }

  function openDetail(id: string): void {
    detailId = id;
    renderDetail();
    if (!detailDlg.dialog.open) detailDlg.dialog.showModal();
  }

  function renderDetail(): void {
    if (!detailId) return;
    const d = heroDetail(progress.state, pd, data, detailId);
    if (!d) return;
    detailDlg.title.textContent = d.name;
    const why: Record<string, string> = { notOwned: '보유하지 않은 영웅이에요', max: '최고 레벨이에요', cards: '카드가 모자라요', flame: '🔥 불꽃이 모자라요 (판을 하면 모여요)', ok: '' };
    let action: HTMLElement;
    if (d.locked) {
      action = h(
        'button',
        {
          class: 'btn btn-primary hero-unlock',
          attrs: { type: 'button', 'data-testid': 'hero-unlock', ...(d.canUnlock ? {} : { disabled: '' }) },
          on: {
            click: () => {
              if (progress.unlock(d.id) === 'ok') opts.toast(`🔓 ${d.name} 해방!`, 2000);
            },
          },
        },
        `🔓 해방 (🧩 ${d.cards}/${d.need ?? 0})`,
      );
    } else if (d.cost) {
      action = h(
        'button',
        {
          class: 'btn btn-primary hero-levelup',
          attrs: { type: 'button', 'data-testid': 'hero-levelup', 'aria-label': `레벨업 카드 ${d.cost.cards} 불꽃 ${d.cost.flame}`, ...(d.check === 'ok' ? {} : { disabled: '' }) },
          on: {
            click: () => {
              const r = progress.levelUp(d.id);
              if (typeof r === 'number') opts.toast(`⬆ ${d.name} Lv ${r}!`, 1800);
            },
          },
        },
        h('span', { text: '레벨업' }),
        h('small', { text: `🃏 ${d.cost.cards} · 🔥 ${fmt(d.cost.flame)}` }),
      );
    } else action = h('p', { class: 'hero-detail-why', text: d.owned ? '최고 레벨이에요' : '카드를 얻으면 영입돼요' });
    detailDlg.body.replaceChildren(
      h(
        'div',
        { class: `hero-detail grade-${d.grade}`, attrs: { style: `--grade-color:${d.color}`, 'data-hero': d.id } },
        h(
          'div',
          { class: 'hero-detail-top' },
          h('span', { class: 'hero-detail-art' }, portrait(d.id, d.name, 'hero-detail-portrait')),
          h(
            'div',
            { class: 'hero-detail-info' },
            h('span', { class: 'hero-detail-grade', text: d.gradeName }),
            h('strong', { class: 'hero-detail-lv', attrs: { 'data-testid': 'hero-detail-level' }, text: d.owned ? `Lv ${d.level}` : d.locked ? '잠김' : '보유하지 않음' }),
            h('span', { class: 'hero-detail-cards', attrs: { 'data-testid': 'hero-detail-cards' }, text: d.locked ? `🧩 조각 ${d.cards}/${d.need}` : d.need !== null ? `🃏 카드 ${d.cards}/${d.need}` : `🃏 카드 ${d.cards}` }),
            d.owned ? h('span', { class: 'hero-detail-bonus', attrs: { 'data-testid': 'hero-detail-bonus' }, text: `전투 공격력 ${d.bonus}${d.nextBonus ? ` → ${d.nextBonus}` : ''}` }) : null,
            d.inDeck ? h('span', { class: 'hero-detail-deck', text: '⚔ 전투 덱' }) : null,
          ),
        ),
        h('p', { class: 'hero-detail-lore', text: d.lore }),
        h('dl', { class: 'hero-stats' }, ...d.stats.flatMap((s) => [h('dt', { text: s.label }), h('dd', { text: s.value })])),
        d.ability ? h('p', { class: 'hero-detail-ability' }, h('strong', { text: '특색 ' }), d.ability) : null,
        d.awaken ? h('p', { class: 'hero-detail-ability' }, h('strong', { text: '각성 ' }), d.awaken) : null,
        d.recipe.length ? h('p', { class: 'hero-detail-ability' }, h('strong', { text: '조합 ' }), d.recipe.join(' + ')) : null,
        h('p', { class: 'hero-detail-role', text: d.role }),
        h('div', { class: 'hero-detail-actions' }, action, d.cost && d.check !== 'ok' ? h('span', { class: 'hero-detail-why', text: why[d.check] ?? '' }) : null),
      ),
    );
  }

  // ---------- 상점 탭 ----------
  const shopPanel = h('section', { class: 'lobby-panel lobby-shop', attrs: { 'data-panel': 'shop', 'aria-label': '상점' } });
  function renderShop(): void {
    const s = progress.state;
    shopPanel.replaceChildren(
      h('div', { class: 'lobby-panel-head' }, h('h2', { class: 'lobby-panel-title', text: '상점' })),
      h('p', { class: 'lobby-note', text: '게임에서 얻은 골드와 보석으로만 살 수 있어요.' }),
      h(
        'div',
        { class: 'lobby-scroll shop-list' },
        ...pd.shop.map((it) => {
          const gold = it.price.gold;
          const gems = it.price.gems;
          const afford = gold !== undefined ? s.gold >= gold : s.gems >= (gems ?? 0);
          return h(
            'div',
            { class: 'shop-item', attrs: { 'data-item': it.id } },
            artIcon(it.id as UiArt, it.icon, 'shop-icon'),
            h('span', { class: 'shop-text' }, h('strong', { text: it.name }), h('small', { text: it.desc })),
            h('button', {
              class: `btn ${afford ? 'btn-primary' : ''} shop-buy`,
              text: gold !== undefined ? `💰 ${fmt(gold)}` : `💎 ${fmt(gems ?? 0)}`,
              attrs: { type: 'button', 'data-testid': `shop-buy-${it.id}`, 'aria-label': `${it.name} 사기`, ...(afford ? {} : { disabled: '' }) },
              on: {
                click: () => {
                  const r = progress.buy(it.id);
                  if (typeof r === 'string') opts.toast(r === 'gold' ? '골드가 모자라요' : r === 'gems' ? '보석이 모자라요' : '살 수 없어요');
                  else showGrant(it.name, r);
                },
              },
            }),
          );
        }),
      ),
    );
  }

  // ---------- 도감/카드 탭 ----------
  const codexPanel = h('section', { class: 'lobby-panel lobby-codex', attrs: { 'data-panel': 'codex', 'aria-label': '도감' } });
  function renderCodex(): void {
    const rows = fragmentRows(progress.state, pd, data);
    const unlocked = rows.filter((r) => r.unlocked).length;
    codexPanel.replaceChildren(
      h('div', { class: 'lobby-panel-head' }, h('h2', { class: 'lobby-panel-title', text: '리미티드 도감' }), h('span', { class: 'lobby-count', attrs: { 'data-testid': 'codex-count' }, text: `해방 ${unlocked}/${rows.length}` })),
      h('p', { class: 'lobby-note', text: `리미티드 영웅은 조각 ${pd.hidden.unlockFragments}개를 모아 해방해야 전투에서 조합할 수 있어요. 조각은 보스 처치·웨이브 길·퀘스트·상점에서 얻어요.` }),
      h(
        'div',
        { class: 'lobby-scroll codex-list' },
        ...rows.map((r) =>
          h(
            'div',
            { class: `codex-row${r.unlocked ? ' is-unlocked' : ''}${r.canUnlock ? ' is-ready' : ''}`, attrs: { 'data-hero': r.id } },
            h('span', { class: 'codex-art' }, portrait(r.id, r.name, 'codex-portrait')),
            h(
              'span',
              { class: 'codex-text' },
              h('strong', { text: r.name }),
              h('small', { class: 'codex-recipe', text: r.recipe.length ? `조합: ${r.recipe.join(' + ')}` : '' }),
              r.unlocked
                ? h('span', { class: 'codex-state', text: '🔓 해방됨' })
                : h(
                    'span',
                    { class: 'codex-frag' },
                    h('span', { class: 'hero-card-bar' }, h('span', { class: 'hero-card-fill', attrs: { style: `width:${Math.min(100, Math.round((r.have / r.need) * 100))}%` } })),
                    h('span', { class: 'codex-frag-num', attrs: { 'data-testid': `codex-frag-${r.id}` }, text: `🧩 ${r.have}/${r.need}` }),
                  ),
            ),
            r.unlocked
              ? h('button', { class: 'btn btn-chip codex-open', text: '보기', attrs: { type: 'button' }, on: { click: () => openDetail(r.id) } })
              : h('button', {
                  class: `btn btn-chip ${r.canUnlock ? 'btn-primary' : ''} codex-unlock`,
                  text: '해방',
                  attrs: { type: 'button', 'data-testid': `codex-unlock-${r.id}`, 'aria-label': `${r.name} 해방`, ...(r.canUnlock ? {} : { disabled: '' }) },
                  on: {
                    click: () => {
                      if (progress.unlock(r.id) === 'ok') opts.toast(`🔓 ${r.name} 해방!`, 2000);
                    },
                  },
                }),
          ),
        ),
      ),
    );
  }

  // ---------- 잠긴 모드 탭 ----------
  const lockedPanel = h('section', { class: 'lobby-panel lobby-locked', attrs: { 'data-panel': 'locked', 'aria-label': '캠페인' } });
  function renderLocked(): void {
    lockedPanel.replaceChildren(
      h('div', { class: 'lobby-panel-head' }, h('h2', { class: 'lobby-panel-title', text: '새 모드' })),
      ...pd.modes.map((m) => {
        const open = modeUnlocked(progress.state, m);
        return h(
          'div',
          { class: `mode-card${open ? ' is-open' : ''}`, attrs: { 'data-mode': m.id } },
          h('span', { class: 'mode-icon', text: open ? '🏰' : '🔒', attrs: { 'aria-hidden': 'true' } }),
          h('strong', { class: 'mode-name', text: m.name }),
          h('p', { class: 'mode-desc', text: m.desc }),
          open
            ? h('button', {
                class: 'btn btn-primary mode-start',
                text: `${m.name} 시작`,
                attrs: { type: 'button', 'data-testid': `mode-start-${m.id}` },
                on: {
                  click: () => {
                    lockAll();
                    opts.onCampaign();
                  },
                },
              })
            : h('p', { class: 'mode-lock', attrs: { 'data-testid': `mode-lock-${m.id}` }, text: `계정 Lv ${m.unlockLevel}에 열려요 (지금 Lv ${progress.state.level})` }),
        );
      }),
    );
  }

  // ---------- 퀘스트 · 모집 · 설정 창 ----------
  function questRow(q: QuestView, daily: boolean): HTMLElement {
    const pct = Math.round((q.progress / q.quest.target) * 100);
    return h(
      'div',
      { class: `quest-row${q.done ? ' is-done' : ''}${q.claimed ? ' is-claimed' : ''}`, attrs: { 'data-quest': q.quest.id } },
      h(
        'span',
        { class: 'quest-text' },
        h('strong', { text: q.quest.name }),
        h('small', { text: rewardText(q.quest.reward) }),
        h('span', { class: 'hero-card-bar' }, h('span', { class: 'hero-card-fill', attrs: { style: `width:${pct}%` } })),
      ),
      q.claimed
        ? h('span', { class: 'wave-done', text: '✓' })
        : h('button', {
            class: `btn btn-chip ${q.done ? 'btn-primary' : ''} quest-claim`,
            text: q.done ? '받기' : `${fmt(q.progress)}/${fmt(q.quest.target)}`,
            attrs: { type: 'button', 'data-testid': `quest-claim-${q.quest.id}`, ...(q.done ? {} : { disabled: '' }) },
            on: { click: () => showGrant(daily ? '일일 퀘스트' : '업적', progress.claimQuest(q.quest.id)) },
          }),
    );
  }

  function renderQuests(): void {
    const today = progress.today();
    const s = progress.state;
    const segBtn = (id: 'daily' | 'achievements', label: string): HTMLElement =>
      h('button', {
        class: `btn btn-chip lobby-seg${questTab === id ? ' is-on' : ''}`,
        text: label,
        attrs: { type: 'button', 'aria-pressed': String(questTab === id), 'data-quest-tab': id },
        on: {
          click: () => {
            questTab = id;
            renderQuests();
          },
        },
      });
    const list =
      questTab === 'daily'
        ? [
            h('p', { class: 'lobby-note', text: '일일 퀘스트는 매일 자정(기기 시간)에 새로 시작해요.' }),
            ...dailyQuests(s, pd, today).map((q) => questRow(q, true)),
            h(
              'div',
              { class: `quest-row quest-bonus${dailyBonusReady(s, pd, today) ? ' is-done' : ''}` },
              h('span', { class: 'quest-text' }, h('strong', { text: '오늘 퀘스트 모두 완료' }), h('small', { text: rewardText(pd.quests.dailyAllBonus) })),
              s.daily.bonusClaimed && s.daily.date === today
                ? h('span', { class: 'wave-done', text: '✓' })
                : h('button', {
                    class: `btn btn-chip ${dailyBonusReady(s, pd, today) ? 'btn-primary' : ''} quest-claim`,
                    text: '받기',
                    attrs: { type: 'button', 'data-testid': 'quest-claim-bonus', ...(dailyBonusReady(s, pd, today) ? {} : { disabled: '' }) },
                    on: { click: () => showGrant('오늘 보너스', progress.claimDailyBonus()) },
                  }),
            ),
          ]
        : achievementQuests(s, pd)
            .sort((a, b) => Number(a.claimed) - Number(b.claimed) || Number(b.done) - Number(a.done))
            .map((q) => questRow(q, false));
    // 피드백 #11: 일일·보너스·업적 보상을 한 번에 받기
    const ready = claimableQuests(s, pd, today);
    const claimAll = h('button', {
      class: `btn btn-chip ${ready > 0 ? 'btn-primary' : ''} quest-claim-all`,
      text: ready > 0 ? `모두 받기 ${ready}` : '모두 받기',
      attrs: { type: 'button', 'data-testid': 'quest-claim-all', ...(ready > 0 ? {} : { disabled: '' }) },
      on: { click: () => showGrant('퀘스트 보상', progress.claimAllQuests()) },
    });
    questDlg.body.replaceChildren(
      h('div', { class: 'quest-top' }, h('div', { class: 'lobby-segs quest-segs' }, segBtn('daily', '일일'), segBtn('achievements', '업적')), claimAll),
      h('div', { class: 'quest-list' }, ...list),
    );
  }

  function openQuests(): void {
    progress.refresh();
    renderQuests();
    questDlg.dialog.showModal();
  }

  function renderRecruit(): void {
    const s = progress.state;
    const ready = s.recruit >= pd.recruit.goal;
    recruitDlg.body.replaceChildren(
      h('p', { class: 'lobby-note', text: `전투에서 영웅을 ${pd.recruit.summonsPerPoint}번 소환할 때마다 게이지가 1칸 차요. ${pd.recruit.goal}칸을 채우면 영웅 카드를 받아요.` }),
      h(
        'div',
        { class: 'recruit-gauge' },
        h('span', { class: 'lobby-gauge is-big' }, h('span', { class: 'lobby-gauge-fill', attrs: { style: `width:${Math.min(100, Math.round((s.recruit / pd.recruit.goal) * 100))}%` } })),
        h('strong', { attrs: { 'data-testid': 'recruit-progress' }, text: `${Math.min(s.recruit, pd.recruit.goal)}/${pd.recruit.goal}` }),
      ),
      h('p', { class: 'recruit-reward', text: `보상: ${rewardText(pd.recruit.reward)} (레어 이상이 잘 나와요)` }),
      h('button', {
        class: `btn ${ready ? 'btn-primary' : ''} recruit-claim`,
        text: ready ? '모집 보상 받기' : '게이지를 채워 주세요',
        attrs: { type: 'button', 'data-testid': 'recruit-claim', ...(ready ? {} : { disabled: '' }) },
        on: {
          click: () => {
            const g = progress.claimRecruit();
            if (g) {
              recruitDlg.dialog.close();
              showGrant('영웅 모집', g);
            }
          },
        },
      }),
    );
  }

  function openRecruit(): void {
    renderRecruit();
    recruitDlg.dialog.showModal();
  }

  if (settingsDlg && opts.settings) {
    const st = opts.settings;
    const vol = h('input', { class: 'pause-volume', attrs: { type: 'range', min: '0', max: '100', step: '5', value: String(st.effectVolume), 'aria-label': '효과음 크기', 'data-testid': 'lobby-volume' } });
    const volText = h('output', { class: 'pause-volume-value', text: `${st.effectVolume}%` });
    vol.addEventListener('input', () => {
      st.onEffectVolume(vol.valueAsNumber);
      volText.textContent = `${vol.valueAsNumber}%`;
    });
    vol.addEventListener('change', () => st.onPreviewAudio?.());
    const toggle = (label: string, initial: boolean, testid: string, on: (v: boolean) => void): HTMLElement => {
      let cur = initial;
      const b = h('button', { class: `btn dv-switch${cur ? ' is-on' : ''}`, text: cur ? '켜짐' : '꺼짐', attrs: { type: 'button', role: 'switch', 'aria-checked': String(cur), 'aria-label': label, 'data-testid': testid } });
      b.addEventListener('click', () => {
        cur = !cur;
        on(cur);
        b.textContent = cur ? '켜짐' : '꺼짐';
        b.classList.toggle('is-on', cur);
        b.setAttribute('aria-checked', String(cur));
      });
      return h('div', { class: 'lobby-setting' }, h('span', { text: label }), b);
    };
    settingsDlg.body.replaceChildren(
      h('div', { class: 'lobby-setting' }, h('span', {}, '효과음 크기 ', volText), vol),
      toggle('화면 흔들림', st.screenShake, 'lobby-shake', st.onScreenShake),
      toggle('눌러서 바로 승급', st.tapMerge, 'lobby-tap-merge', st.onTapMerge),
      ...(st.feedback ? [feedbackButton(st.feedback, 'lobby-feedback')] : []),
      h('p', { class: 'lobby-note', text: `버전 ${opts.version} · 저장은 이 기기에만 있어요.` }),
    );
  }

  // ---------- 아래 메뉴 ----------
  const nav = h('nav', { class: 'lobby-nav', attrs: { 'aria-label': '로비 메뉴', 'data-testid': 'lobby-nav' } });
  const panels: Record<LobbyTab, HTMLElement> = { shop: shopPanel, heroes: heroesPanel, battle: battlePanel, codex: codexPanel, locked: lockedPanel };

  function renderNav(): void {
    const s = progress.state;
    const counts: Record<LobbyTab, number> = {
      shop: 0,
      heroes: heroesReady(s, pd, data),
      battle: waveRoad(s, pd).ready + claimableQuests(s, pd, progress.today()) + (s.recruit >= pd.recruit.goal ? 1 : 0),
      codex: codexReady(s, pd, data),
      locked: 0,
    };
    const campaignOpen = pd.modes[0] ? modeUnlocked(s, pd.modes[0]) : false;
    nav.replaceChildren(
      ...LOBBY_TABS.map((id) => {
        const item = NAV[id];
        const icon = id === 'locked' && campaignOpen ? '🏰' : item.icon;
        return h(
          'button',
          {
            class: `lobby-nav-btn${tab === id ? ' is-on' : ''}${id === 'battle' ? ' is-main' : ''}`,
            attrs: { type: 'button', 'data-tab': id, 'aria-current': tab === id ? 'page' : 'false', 'aria-label': item.label },
            on: { click: () => select(id) },
          },
          id === 'shop' ? artIcon('shop', icon, 'lobby-nav-icon') : h('span', { class: 'lobby-nav-icon', text: icon, attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'lobby-nav-label', text: item.label }),
          badge(counts[id]),
        );
      }),
    );
  }

  function renderPanel(): void {
    // 피드백 #61: 해방·레벨업 등으로 같은 탭을 다시 그리면 새 스크롤 상자가 맨 위에서 시작했다 → 위치를 그대로 옮긴다
    // (탭을 바꿀 때는 select()가 맨 위로)
    const scrollTop = panels[tab].querySelector<HTMLElement>('.lobby-scroll')?.scrollTop ?? 0;
    if (tab === 'battle') {
      renderRoad();
      renderSide();
    } else if (tab === 'heroes') renderHeroes();
    else if (tab === 'shop') renderShop();
    else if (tab === 'codex') renderCodex();
    else renderLocked();
    const box = panels[tab].querySelector<HTMLElement>('.lobby-scroll');
    if (box && scrollTop > 0) box.scrollTop = scrollTop;
  }

  const body = h('main', { class: 'lobby-body' }, ...LOBBY_TABS.map((id) => panels[id]));
  const el = h(
    'div',
    {
      class: `screen lobby-screen title-screen${opts.keyArt ? ' has-keyart' : ''}`,
      attrs: { 'data-screen': 'title', 'data-lobby': '1', 'data-keyart': opts.keyArt ? '1' : '0', 'data-tab': tab },
    },
    top,
    body,
    h('div', { class: 'title-version lobby-version', text: opts.version }),
    nav,
    confirmNew,
    recordsDialog,
    grantDlg.dialog,
    detailDlg.dialog,
    questDlg.dialog,
    recruitDlg.dialog,
    settingsDlg?.dialog ?? null,
    // 설정 창 위에 여는 창 → 문서 순서도 맨 끝 (nativeBack이 마지막 열린 창부터 닫는다)
    opts.settings?.feedback?.el ?? null,
  );

  function renderAll(): void {
    renderTop();
    renderNav();
    renderPanel();
    for (const id of LOBBY_TABS) panels[id].hidden = id !== tab;
    el.dataset.tab = tab;
    if (detailDlg.dialog.open) renderDetail();
    if (questDlg.dialog.open) renderQuests();
    if (recruitDlg.dialog.open) renderRecruit();
  }

  function select(next: LobbyTab): void {
    if (tab === next) return;
    tab = next;
    renderAll();
    panels[next].querySelector<HTMLElement>('.lobby-scroll')?.scrollTo?.({ top: 0 });
  }

  const unsubscribe = progress.subscribe(renderAll);
  renderAll();

  return {
    el,
    tab: () => tab,
    select,
    back() {
      if (tab !== 'battle') {
        select('battle');
        return true;
      }
      return false;
    },
    destroy() {
      unsubscribe();
    },
  };
}
