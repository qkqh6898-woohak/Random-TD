/**
 * 전투 기록 창 (A-1, Codex 갈래 M6-6·M6-7에서 옮김): 타이틀 [📜 기록] → <dialog>.
 * 최고 도달 단계 · 최근 5판(단계·게임 시간, 펼치면 처치한 단계·도전 보스) · 처치한 단계 보스 · 처치한 도전 보스.
 * 모양 데이터는 `buildRecordsView`(순수)로 만든다. 안드로이드 뒤로 가기·Esc·[닫기]로 닫힌다.
 */
import type { BattleRecord } from '../../save/BattleRecords';
import { h } from '../dom';

export interface BossRecordRow {
  name: string;
  stage: number;
}

export interface RecentRunView {
  stage: number;
  durationSeconds: number;
  bosses: string[];
  challenges: string[];
}

export interface BattleRecordsView {
  bestStage: number;
  bosses: BossRecordRow[];
  challenges: BossRecordRow[];
  recent: RecentRunView[];
}

/** 기록 + 데이터 이름 → 창 모양 (순수). 모르는 보스 id는 id 그대로. */
export function buildRecordsView(
  record: BattleRecord,
  bosses: readonly { id: string; name: string }[],
  challenges: readonly { level: number; name: string }[],
): BattleRecordsView {
  const bossName = new Map(bosses.map((b) => [b.id, b.name]));
  const upTo = (best: number) => challenges.filter((c) => c.level <= best);
  return {
    bestStage: record.bestStage,
    bosses: Object.entries(record.bossClears)
      .map(([id, stage]) => ({ name: bossName.get(id) ?? id, stage }))
      .sort((a, b) => a.stage - b.stage),
    challenges: upTo(record.bestChallenge).map((c) => ({ name: c.name, stage: c.level })),
    recent: record.recent.map((r) => ({
      stage: r.stage,
      durationSeconds: r.durationSeconds,
      bosses: r.bossIds.map((id) => bossName.get(id) ?? id),
      challenges: upTo(r.bestChallenge).map((c) => c.name),
    })),
  };
}

/** 게임 시간 글자 ('3분 5초' · '42초') */
export function durationText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

function bossGroup(title: string, rows: BossRecordRow[], unit: (n: number) => string): HTMLElement | null {
  if (rows.length === 0) return null;
  return h(
    'section',
    { class: 'records-group' },
    h('h3', { text: title }),
    h('ul', {}, ...rows.map((r) => h('li', {}, h('span', { text: r.name }), h('strong', { text: unit(r.stage) })))),
  );
}

function runDetails(run: RecentRunView, index: number): HTMLDetailsElement {
  const el = h(
    'details',
    { class: 'records-run' },
    h(
      'summary',
      {},
      h(
        'span',
        { class: 'records-run-summary' },
        h('strong', { text: run.stage > 0 ? `${run.stage}단계` : '준비' }),
        h('time', { text: durationText(run.durationSeconds), attrs: { datetime: `PT${run.durationSeconds}S` } }),
      ),
    ),
    h(
      'div',
      { class: 'records-run-bosses' },
      run.bosses.length > 0 ? h('p', { text: `단계 보스 · ${run.bosses.join(', ')}` }) : null,
      run.challenges.length > 0 ? h('p', { text: `도전 보스 · ${run.challenges.join(', ')}` }) : null,
      run.bosses.length + run.challenges.length === 0 ? h('p', { text: '처치한 보스 없음' }) : null,
    ),
  );
  if (index === 0) el.open = true;
  return el;
}

export function createRecordsDialog(view: BattleRecordsView): HTMLDialogElement {
  const close = h('button', { class: 'btn records-close', text: '닫기', attrs: { type: 'button', 'data-testid': 'records-close' } });
  const dialog = h(
    'dialog',
    { class: 'title-dialog records-dialog', attrs: { 'aria-labelledby': 'records-title', 'data-testid': 'records-dialog' } },
    h('header', { class: 'records-header' }, h('h2', { attrs: { id: 'records-title' }, text: '전투 기록' }), close),
    h(
      'div',
      { class: 'records-body' },
      h(
        'p',
        { class: 'records-best' },
        h('span', { text: '최고 도달 단계' }),
        h('strong', { attrs: { 'data-testid': 'records-best' }, text: view.bestStage > 0 ? `${view.bestStage}단계` : '기록 없음' }),
      ),
      h(
        'section',
        { class: 'records-group', attrs: { 'aria-labelledby': 'records-recent-title', role: 'region' } },
        h('h3', { attrs: { id: 'records-recent-title' }, text: '최근 5판' }),
        view.recent.length > 0
          ? h('p', { class: 'records-note', text: '플레이 시간은 배속이 반영된 게임 시간이에요.' })
          : h('p', { class: 'records-note', text: '무한 모드에서 판이 끝나면 여기에 표시돼요.' }),
        ...view.recent.map(runDetails),
      ),
      bossGroup('처치한 단계 보스', view.bosses, (n) => `${n}단계`),
      bossGroup('처치한 도전 보스', view.challenges, (n) => `도전 ${n}`),
      view.bosses.length + view.challenges.length === 0 ? h('p', { class: 'records-note', text: '아직 처치한 보스가 없어요.' }) : null,
    ),
  );
  close.addEventListener('click', () => dialog.close());
  // 바깥(배경)을 누르면 닫힘
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  return dialog;
}
