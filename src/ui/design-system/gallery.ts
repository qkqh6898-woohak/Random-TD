/** Development-only component gallery, dynamically imported behind import.meta.env.DEV. */
import { assetUrl } from '../../assets';
import { h } from '../dom';
import type { Grade } from '../../data/load';
import { GRADE_NAMES } from '../panels/towerPanelModel';
import { createButton, createCurrencyBar, createGradeCard, createIcon, createNotificationDot, createNumberBadge, createPopup, createPopupFrame, createProgress, createUpgradeArrow, DESIGN_ICONS, loadDesignFont, type DesignIcon } from './index';
import './gallery.css';

const ICON_LABELS: Record<DesignIcon, string> = {
  shop: '상점', heroes: '영웅', battle: '전투', codex: '도감', campaign: '캠페인', friends: '친구', mail: '우편', menu: '메뉴', quests: '퀘스트', settings: '설정', mission: '미션', stats: '통계', speed: '배속', chat: '채팅', sell: '판매', delete: '삭제', pause: '일시정지', info: '정보', close: '닫기', gold: '골드', diamond: '다이아', flame: '불꽃', energy: '에너지', 'battle-coin': '전투 코인', luck: '행운석', upgrade: '강화', plus: '더하기', mythic: GRADE_NAMES.hidden, roulette: '룰렛',
};
const section = (n: string, title: string, description: string, ...body: HTMLElement[]) => h('section', { class: 'rtd-gallery-section' },
  h('header', {}, h('span', { class: 'rtd-gallery-index', text: n }), h('h2', { text: title })), h('p', { class: 'rtd-gallery-description', text: description }), ...body);
const row = (...children: HTMLElement[]) => h('div', { class: 'rtd-gallery-row' }, ...children);
const grid = (name: string, ...children: HTMLElement[]) => h('div', { class: `rtd-gallery-grid rtd-gallery-grid--${name}` }, ...children);

export async function mountDesignGallery(host: HTMLElement): Promise<void> {
  let fontState = 'loaded';
  try { await loadDesignFont(); } catch { fontState = 'fallback'; }
  const status = h('p', { class: 'rtd-gallery-status', attrs: { role: 'status', 'aria-live': 'polite' }, text: '버튼을 눌러 상태와 팝업을 확인하세요.' });
  const report = (text: string) => { status.textContent = text; };
  const details = h('div');
  const detailPopup = createPopup({ title: '캐릭터 카드', variant: 'pinned', content: details, primaryLabel: '확인', onPrimary: () => detailPopup.close() });
  const cards: [Grade, string, string][] = [
    ['normal', '광부', 'miner'], ['rare', '바람 궁수', 'windarcher'], ['unique', '얼음 마법사', 'icemage'], ['hero', '수호 기사', 'paladin'], ['legend', '대마법사', 'archmage'], ['god', '운명', 'fate'], ['hidden', '원소 지배자', 'elemental'],
  ];
  const cardGrid = grid('cards', ...cards.map(([grade, name, id], i) => createGradeCard({ grade, name, level: i + 1, progress: 25 + i * 10, progressLabel: `${name} 조각 수집 진행`, portrait: assetUrl(`assets/characters/${id}.webp`), owned: true, notification: i === 0, onClick: () => {
    details.replaceChildren(h('h3', { text: name }), h('p', { class: 'rtd-detail-grade', text: `등급 · ${GRADE_NAMES[grade]}` }), h('p', { text: '등급 이름과 색을 함께 표시합니다.' }));
    detailPopup.open();
  } })), createGradeCard({ grade: 'hidden', name: '미보유 예시', level: 1, progress: 0, progressLabel: '미보유 조각', portrait: assetUrl('assets/characters/elemental.webp'), owned: false, onClick: () => { details.replaceChildren(h('p', { text: `${GRADE_NAMES.hidden} · 미보유` })); detailPopup.open(); } }));
  const toggleDotHost = h('span', { class: 'rtd-gallery-dot-host' }, createIcon('mail', { art: null }), createNotificationDot(true));
  let dotVisible = true;
  const toggler = createButton({ label: '알림 표시 전환', variant: 'pill', onClick: () => { dotVisible = !dotVisible; toggleDotHost.lastElementChild?.replaceWith(createNotificationDot(dotVisible)); report(dotVisible ? '알림 점 표시' : '알림 점 숨김'); } });
  const iconGrid = grid('icons', ...DESIGN_ICONS.map(id => h('div', { class: 'rtd-gallery-icon-cell', attrs: { 'data-icon-name': id } }, createIcon(id, { art: null }), h('span', { text: ICON_LABELS[id] }))));
  const primary = createButton({ label: '빠른 시작!', cost: '에너지 5', onClick: () => report('빠른 시작 버튼을 눌렀습니다. 게임 상태는 바뀌지 않습니다.') });
  primary.dataset.testid = 'v2-primary';
  const disabled = createButton({ label: '소환', cost: '100', disabled: true, onClick: () => report('실행되면 안 되는 비활성 버튼') });
  disabled.dataset.testid = 'v2-disabled';
  const popupDescription = () => h('div', {}, h('h3', { text: '오늘의 작은 모험' }), h('p', { text: '두꺼운 나무 테두리와 따뜻한 크림 종이로 내용을 또렷하게 보여줍니다.' }), createProgress(65, '예시 진행률 65%'), h('p', { text: '65 / 100' }));
  const openPopup = (variant: 'torn' | 'pinned') => {
    const popup = createPopup({ title: variant === 'torn' ? '보상 확인' : '미션', variant, content: popupDescription(), primaryLabel: '확인', onPrimary: () => popup.close(), onClose: () => { report('팝업을 닫았습니다.'); popup.el.remove(); } });
    host.append(popup.el); popup.open();
  };
  const swatches = [
    ['배경', '--rtd-bg'], ['패널', '--rtd-panel'], ['외곽선', '--rtd-outline'], ['주요 버튼', '--rtd-primary'], ['버튼 그림자', '--rtd-primary-shadow'], ['보조 버튼', '--rtd-secondary'], ['진행', '--rtd-progress'], ['알림', '--rtd-notification'], ['경험치', '--rtd-experience'], ['나무', '--rtd-wood'], ['종이', '--rtd-paper'], ['숲', '--rtd-forest'], ['노란 나무', '--rtd-yellow-tree'], ['흙길', '--rtd-path'], ['잔디', '--rtd-grass'], ['흙벽', '--rtd-earth'], ['강조 숫자', '--rtd-number'], ['치명타', '--rtd-critical'],
  ];
  const palette = grid('swatches', ...swatches.map(([label, token]) => { const block = h('span', { class: 'rtd-gallery-swatch' }); block.style.background = `var(${token})`; return h('div', {}, block, h('span', { text: label })); }));
  const root = h('main', { class: 'rtd-v2 rtd-gallery', attrs: { 'data-testid': 'v2-gallery', 'data-font-state': fontState } },
    h('div', { class: 'rtd-gallery-page' },
      h('header', { class: 'rtd-gallery-hero' }, h('div', {}, h('span', { class: 'rtd-gallery-kicker', text: 'RANDOM TD · V2.0' }), h('h1', { class: 'rtd-outlined', text: '작은 모험의 도구함' }), h('p', { text: 'PR-B 공통 디자인 시스템' })), h('img', { attrs: { src: assetUrl('assets/characters/miner.webp'), alt: '', width: '92', height: '104' } })),
      status,
      section('01', '손끝에 닿는 버튼', '같은 모양과 눌림으로 다음 행동을 알려줍니다.', primary,
        row(createButton({ label: '강화', variant: 'secondary', icon: 'upgrade', onClick: () => report('강화 버튼 선택') }), createButton({ label: '난이도 변경', variant: 'pill', onClick: () => report('보조 버튼 선택') })),
        grid('events', createButton({ label: '퀘스트', variant: 'icon', icon: 'quests', notification: true, selected: true, timer: '2일 남음', onClick: () => openPopup('pinned') }), createButton({ label: '우편', variant: 'icon', icon: 'mail', notification: true, onClick: () => report('우편 버튼 선택') }), createButton({ label: '친구', variant: 'icon', icon: 'friends', onClick: () => report('친구 버튼 선택') })),
        row(createButton({ label: GRADE_NAMES.hidden, variant: 'mode', icon: 'mythic' }), createButton({ label: '룰렛', variant: 'mode', icon: 'roulette' }), createButton({ label: '닫기', variant: 'close', icon: 'close' })),
        grid('states', createButton({ label: '소환', cost: '100' }), disabled),
        h('p', { class: 'rtd-gallery-note', text: '비활성 상태 · 여섯 버튼 모두 같은 입력 규칙을 사용합니다.' }),
        row(createButton({ label: '강화', variant: 'secondary', icon: 'upgrade', disabled: true }), createButton({ label: '잠김', variant: 'pill', disabled: true }), createButton({ label: '닫기', variant: 'close', icon: 'close', disabled: true })),
        row(createButton({ label: '퀘스트', variant: 'icon', icon: 'quests', disabled: true }), createButton({ label: GRADE_NAMES.hidden, variant: 'mode', icon: 'mythic', disabled: true }))),
      section('02', '일곱 빛깔 캐릭터 카드', '기존 등급 순서와 이름을 유지합니다. 카드를 누르면 등급을 글자로도 확인할 수 있습니다.', cardGrid),
      section('03', '작고 명확한 신호', '알림 표시와 가능 횟수는 화면에서 전달받은 값만 보여줍니다.', row(toggleDotHost, toggler), row(createUpgradeArrow(), createNumberBadge(3), h('span', { text: '강화 가능' }))),
      section('04', '가볍게 읽는 재화', '10,800 → 10.8K · 1,200,000 → 1.2M', grid('currencies', ...([
        ['gold', '골드', 10800], ['diamond', '다이아', 1200000], ['energy', '에너지', 30], ['battle-coin', '전투 코인', 3285], ['luck', '행운석', 45],
      ] as const).map(([kind, label, value]) => createCurrencyBar({ kind, label, value, onAdd: () => report(`${label} 추가 버튼 선택`) }))), h('p', { class: 'rtd-gallery-note', text: '불꽃은 아이콘 표본만 제공하며 재화 바나 실제 화면에 연결하지 않습니다.' })),
      section('05', '나무판과 종이 팝업', '찢긴 종이와 핀 고정, 두 가지 변형을 제공합니다.',
        row(createButton({ label: '찢긴 종이 열기', variant: 'pill', onClick: () => openPopup('torn') }), createButton({ label: '핀 고정 열기', variant: 'pill', onClick: () => openPopup('pinned') })),
        createPopupFrame({ title: '보상 확인', content: popupDescription(), primaryLabel: '확인', onPrimary: () => report('종이 팝업 확인'), onClose: () => report('팝업 표본의 닫기 버튼') }),
        createPopupFrame({ title: '미션', variant: 'pinned', content: popupDescription(), primaryLabel: '도전하기', onPrimary: () => openPopup('pinned') })),
      section('06', '오리지널 아이콘 29종', '48px 벡터 · 진갈색 2px 선 · 단색 음영', iconGrid),
      section('07', '색과 글자의 약속', '따뜻한 바탕과 높은 대비의 글자. 주아체는 앱에 포함됩니다.', palette,
        h('div', { class: 'rtd-gallery-type' }, h('p', { class: 'rtd-outlined', text: '또렷한 한글, 즐거운 모험!' }), h('p', { text: '본문 14px · 작은 글자 12px' }), h('p', { class: 'rtd-gallery-numbers', text: '10.8K  /  1.2M' })), createProgress(72, '경험치 72%', 'experience')),
      h('footer', { class: 'rtd-gallery-footer', text: '개발용 갤러리 · 게임 메뉴에는 표시되지 않습니다.' })), detailPopup.el);
  host.replaceChildren(root);
}
