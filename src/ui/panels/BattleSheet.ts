import type { Match } from '../../sim/match';
import { MISSION_CLAIMED, MISSION_DONE, MISSION_OPEN } from '../../sim/state';
import { missionProgress, missionsClaimable, towerCensus } from '../../sim/systems/Mission';
import { upgradeCheck, upgradeCost, upgradeEffectBp, upgradeLevel } from '../../sim/systems/Upgrade';
import { h } from '../dom';
import { withCommas } from '../hud/hudModel';
import type { UiView } from '../root';
import { fmtScaled2, GRADE_NAMES } from './towerPanelModel';

export type BattleSheetKind = 'upgrade' | 'missions';

export interface BattleSheetView extends UiView {
  readonly kind: BattleSheetKind;
  update(): void;
  focusClose(): void;
}

interface BattleSheetOptions {
  onClose(): void;
  onUpgrade(index: number): void;
  onClaim(index: number): void;
  onClaimAll(): void;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function upgradeList(match: Match, player: number, buy: (index: number) => void) {
  const { ctx, rules, state } = match;
  const rows = rules.upgrades.map((rule) => {
    const level = h('span', { class: 'battle-level' });
    const effect = h('span', { class: 'battle-effect' });
    const scope = rule.kind === 'grade'
      ? `${rule.grades.map((grade) => GRADE_NAMES[grade]).join('·')} 공격력`
      : rule.kind === 'transcend' ? '모든 타워 공격력' : '모든 타워';
    const button = h('button', {
      class: 'btn battle-purchase',
      attrs: { type: 'button', 'data-testid': `upgrade-${rule.id}` },
      on: { click: () => buy(rule.k) },
    });
    const row = h('div', { class: 'battle-entry' },
      h('div', { class: 'battle-entry-main' },
        h('div', { class: 'battle-entry-title' }, h('strong', { text: rule.name }), level),
        h('div', { class: 'battle-detail' }, `${scope} `, effect),
      ), button,
    );
    return { row, rule, level, effect, button };
  });
  const group = (title: string, kind: typeof rules.upgrades[number]['kind']) => h('section', {},
    h('h3', { class: 'battle-group-title', text: title }),
    ...rows.filter((row) => row.rule.kind === kind).map((row) => row.row),
  );
  const body = h('div', { class: 'battle-list' }, group('등급 강화', 'grade'), group('능력치 강화', 'stat'), group('초월 강화', 'transcend'));
  return {
    body,
    update() {
      for (const { rule, level, effect, button } of rows) {
        const lv = upgradeLevel(state, player, rule.k);
        const cost = upgradeCost(rules, rule, lv);
        const fail = upgradeCheck(ctx, player, rule.k);
        const unit = rule.stat === 'critChance' || rule.stat === 'critMul' ? '%p' : '%';
        const current = `+${fmtScaled2(upgradeEffectBp(rule, lv), 100)}${unit}`;
        const next = `+${fmtScaled2(upgradeEffectBp(rule, lv + 1), 100)}${unit}`;
        setText(level, `Lv${lv}`);
        setText(effect, fail === 'locked' ? '등급 강화 3종 최대 시 해금' : cost === null ? current : `${current} → ${next}`);
        const price = cost === null ? '최대' : fail === 'locked' ? '잠김' : `${withCommas(cost)}원`;
        setText(button, price);
        button.disabled = fail !== null;
        button.setAttribute('aria-label', `${rule.name} ${price}`);
      }
    },
  };
}

function missionList(match: Match, claim: (index: number) => void, claimAll: () => void) {
  const { ctx, rules, state, world } = match;
  const list = h('div', { class: 'battle-list', attrs: { 'data-testid': 'mission-list' } });
  const all = h('button', {
    class: 'btn battle-purchase',
    text: '모두 받기',
    attrs: { type: 'button', 'data-testid': 'claim-all-missions' },
    on: { click: claimAll },
  });
  const ready = h('span', { class: 'battle-detail' });
  const rows = rules.missions.map((mission, i) => {
    const name = h('strong');
    const detail = h('span', { class: 'battle-detail' });
    const progress = h('progress', { class: 'battle-progress', attrs: { 'aria-label': '미션 진행도' } });
    const status = h('span', { class: 'battle-detail' });
    const button = h('button', {
      class: 'btn battle-purchase',
      attrs: { type: 'button', 'data-testid': `claim-mission-${mission.id}` },
      on: { click: () => claim(i) },
    });
    const row = h('div', { class: 'battle-entry', attrs: { 'data-mission': mission.id } },
      h('div', { class: 'battle-entry-main' }, name, detail, progress, status), button,
    );
    return { mission, i, row, name, detail, progress, status, button };
  });
  let previousOrder = '';
  return {
    body: h('div', { class: 'battle-missions' }, h('div', { class: 'battle-mission-summary' }, ready, all), list),
    update() {
      const count = missionsClaimable(state);
      setText(ready, `받을 수 있는 보상 ${count}개`);
      all.disabled = count === 0;
      const census = towerCensus(world);
      const ordered = [MISSION_DONE, MISSION_OPEN, MISSION_CLAIMED]
        .flatMap((status) => rows.filter(({ i }) => state.missionStatus[i] === status));
      const order = ordered.map(({ i }) => i).join(',');
      if (previousOrder !== order) {
        list.replaceChildren(...ordered.map(({ row }) => row));
        previousOrder = order;
      }
      for (const { mission, i, row, name, detail, progress, status, button } of ordered) {
        const missionState = state.missionStatus[i];
        const secret = mission.hidden && missionState === MISSION_OPEN;
        const done = missionState === MISSION_DONE;
        const claimed = missionState === MISSION_CLAIMED;
        const [current, target] = missionProgress(ctx, world, i, census);
        setText(name, secret ? '???' : mission.name);
        setText(detail, secret ? '히든 미션' : mission.name === mission.desc ? '' : mission.desc);
        setText(status, secret ? '' : `${current}/${target} · 보상 ${withCommas(mission.reward)}원`);
        progress.hidden = secret;
        progress.max = target;
        progress.value = current;
        row.classList.toggle('is-claimable', done);
        setText(button, claimed ? '수령 완료' : done ? '받기' : '진행 중');
        button.hidden = secret;
        button.disabled = !done;
        button.setAttribute('aria-label', `${name.textContent} ${button.textContent}`);
      }
    },
  };
}

export function createBattleSheet(kind: BattleSheetKind, match: Match, player: number, opts: BattleSheetOptions): BattleSheetView {
  const title = kind === 'upgrade' ? '강화' : '미션';
  const content = kind === 'upgrade' ? upgradeList(match, player, opts.onUpgrade) : missionList(match, opts.onClaim, opts.onClaimAll);
  const close = h('button', {
    class: 'btn btn-chip battle-close',
    text: '✕',
    attrs: { type: 'button', 'aria-label': `${title} 닫기` },
    on: { click: opts.onClose },
  });
  const gold = h('span', { class: 'battle-wallet' });
  const el = h('section', {
    class: 'battle-sheet',
    attrs: { id: 'battle-sheet', role: 'dialog', 'aria-labelledby': 'battle-sheet-title', 'data-testid': `battle-${kind}` },
    on: { keydown: (ev) => { if ((ev as KeyboardEvent).key === 'Escape') opts.onClose(); } },
  }, h('header', { class: 'battle-head' }, h('h2', { text: title, attrs: { id: 'battle-sheet-title' } }), gold, close), content.body);
  let lastTick = -1;
  const update = () => {
    if (match.tick === lastTick) return;
    lastTick = match.tick;
    setText(gold, `${withCommas(match.state.gold)}원`);
    content.update();
  };
  update();
  return {
    el, kind, update,
    focusClose() { close.focus({ preventScroll: true }); },
  };
}
