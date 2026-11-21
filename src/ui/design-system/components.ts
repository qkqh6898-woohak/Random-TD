import type { Grade } from '../../data/load';
import { GRADE_NAMES } from '../panels/towerPanelModel';
import { h } from '../dom';
import { createIcon, type DesignIcon } from './icons';
import type { UiIconId } from '../uiIcons';
import { formatCompactNumber } from './format';

/** All state comes from the caller; no save, reward, affordability or unlock decisions here. */
export function createNotificationDot(visible: boolean): HTMLElement {
  const dot = h('span', { class: 'rtd-notification', attrs: { 'aria-hidden': 'true' } });
  dot.hidden = !visible;
  return dot;
}

export interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'pill' | 'icon' | 'mode' | 'close';
  icon?: DesignIcon;
  /** ART-2 힉스필드 그림을 따로 고를 때 (기본 = DESIGN_ICON_ART[icon], null = PR-B 벡터만) */
  iconArt?: UiIconId | null;
  cost?: string;
  disabled?: boolean;
  notification?: boolean;
  selected?: boolean;
  timer?: string;
  onClick?: () => void;
}
export function createButton(props: ButtonProps): HTMLButtonElement {
  const variant = props.variant ?? 'primary';
  const accessibleName = [props.label, props.cost, props.selected ? props.timer : undefined, props.notification ? '새 알림' : ''].filter(Boolean).join(' · ');
  const button = h('button', { class: `rtd-button rtd-button--${variant}`, attrs: { type: 'button', 'aria-label': accessibleName, ...(props.selected !== undefined ? { 'aria-pressed': String(props.selected) } : {}) }, on: { click: () => props.onClick?.() } });
  button.disabled = props.disabled ?? false;
  button.classList.toggle('is-selected', props.selected ?? false);
  const icon = props.icon ?? (variant === 'close' ? 'close' : undefined);
  button.append(h('span', { class: 'rtd-button-face' }, icon ? createIcon(icon, { art: props.iconArt }) : null, h('span', { class: 'rtd-button-label', text: props.label })));
  if (props.cost !== undefined) button.append(h('span', { class: 'rtd-button-cost', text: props.cost }));
  if (props.selected && props.timer) button.append(h('span', { class: 'rtd-button-timer', text: props.timer }));
  if (props.notification) button.append(createNotificationDot(true));
  return button;
}

export function createUpgradeArrow(label = '강화 가능'): HTMLElement {
  return h('span', { class: 'rtd-upgrade-arrow', attrs: { role: 'img', 'aria-label': label } }, createIcon('upgrade'));
}
export function createNumberBadge(count: number): HTMLElement {
  return h('span', { class: 'rtd-number-badge', text: formatCompactNumber(count), attrs: { 'aria-label': `가능 횟수 ${count}` } });
}

export function createProgress(value: number, label: string, variant: 'progress' | 'experience' = 'progress'): HTMLElement {
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const el = h('div', { class: `rtd-progress rtd-progress--${variant}`, attrs: { role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) } }, h('span', { class: 'rtd-progress-fill' }));
  el.style.setProperty('--rtd-fill', `${percent}%`);
  return el;
}

export interface CardProps {
  grade: Grade; name: string; level: number; progress: number; progressLabel: string;
  portrait: string | null; owned: boolean; progressText?: string; notification?: boolean; onClick?: () => void;
}
export function createGradeCard(props: CardProps): HTMLButtonElement {
  const gradeName = GRADE_NAMES[props.grade];
  const el = h('button', { class: `rtd-card${props.owned ? '' : ' is-unowned'}`, attrs: { type: 'button', 'data-grade': props.grade, 'aria-label': `${props.name} · ${gradeName} · ${props.owned ? `Lv.${props.level}` : '미보유'}${props.notification ? ' · 새 알림' : ''}` }, on: { click: () => props.onClick?.() } });
  const art = props.portrait
    ? h('img', { class: 'rtd-card-portrait', attrs: { src: props.portrait, alt: '', 'aria-hidden': 'true', draggable: 'false', decoding: 'async' } })
    : h('span', { class: 'rtd-card-portrait is-text', text: props.name.slice(0, 1), attrs: { 'aria-hidden': 'true' } });
  const progress = createProgress(props.progress, props.progressLabel);
  if (props.progressText !== undefined) {
    progress.classList.add('rtd-card-progress');
    progress.append(h('span', { class: 'rtd-card-count', text: props.progressText, attrs: { 'aria-hidden': 'true' } }));
  }
  el.append(h('span', { class: 'rtd-card-face' }, props.grade === 'hidden' ? h('span', { class: 'rtd-card-ribbon', text: '★', attrs: { 'aria-hidden': 'true' } }) : null,
    art, h('span', { class: 'rtd-card-level', text: props.owned ? `Lv.${props.level}` : '미보유' }), progress), h('span', { class: 'rtd-card-name', text: props.name }));
  if (props.notification) el.append(createNotificationDot(true));
  return el;
}

export type Currency = 'gold' | 'diamond' | 'energy' | 'battle-coin' | 'luck'; // flame deliberately has no bar API.
export function createCurrencyBar(props: { kind: Currency; label: string; value: number; onAdd?: () => void }): HTMLElement {
  const icon = h('span', { class: 'rtd-currency-icon' }, createIcon(props.kind));
  const el = h('div', { class: 'rtd-currency' }, icon, h('span', { class: 'rtd-currency-value', text: formatCompactNumber(props.value), attrs: { 'aria-label': `${props.label} ${props.value}` } }));
  if (props.onAdd) {
    const add = h('button', { class: 'rtd-currency-add', attrs: { type: 'button', 'aria-label': `${props.label} 추가` }, on: { click: props.onAdd } }, createIcon('plus'));
    icon.append(add);
  }
  return el;
}

export interface PopupProps {
  title: string; variant?: 'torn' | 'pinned'; content: HTMLElement;
  primaryLabel: string; onPrimary?: () => void; onClose?: () => void;
}
export function createPopupFrame(props: PopupProps): HTMLElement {
  const close = createButton({ label: '닫기', variant: 'close', icon: 'close', onClick: props.onClose });
  return h('section', { class: `rtd-popup rtd-popup--${props.variant ?? 'torn'}` },
    h('header', { class: 'rtd-popup-head' }, h('h2', { class: 'rtd-outlined', text: props.title }), close),
    h('div', { class: 'rtd-popup-paper' }, props.content), h('footer', { class: 'rtd-popup-footer' }, createButton({ label: props.primaryLabel, onClick: props.onPrimary })));
}
export function createPopup(props: PopupProps): { el: HTMLDialogElement; open: () => void; close: () => void; destroy: () => void } {
  const el = h('dialog', { class: 'rtd-v2 rtd-dialog', attrs: { 'aria-label': props.title } });
  let opener: HTMLElement | null = null;
  const close = (): void => { if (!el.open) return; el.close(); opener?.focus(); props.onClose?.(); };
  el.append(createPopupFrame({ ...props, onClose: close }));
  el.addEventListener('cancel', event => { event.preventDefault(); close(); });
  el.addEventListener('click', event => { const r = el.getBoundingClientRect(); if (event.target === el && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) close(); });
  return { el, open: () => { if (el.open) return; opener = document.activeElement instanceof HTMLElement ? document.activeElement : null; el.showModal(); }, close, destroy: () => { close(); el.remove(); } };
}
