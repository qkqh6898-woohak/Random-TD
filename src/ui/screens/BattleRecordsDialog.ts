import { h } from '../dom';

interface BossRecordRow {
  name: string;
  stage: number;
}

interface RecentRunView {
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

function bossRecords(title: string, rows: BossRecordRow[]): HTMLElement | null {
  if (rows.length === 0) return null;
  return h('section', { class: 'title-records-group' },
    h('h3', { text: title }),
    h('ul', {}, ...rows.map(({ name, stage }) => h('li', {},
      h('span', { text: name }),
      h('strong', { text: `${stage}단계` }),
    ))),
  );
}

function runDetails(run: RecentRunView, index: number): HTMLDetailsElement {
  const minutes = Math.floor(run.durationSeconds / 60);
  const seconds = run.durationSeconds % 60;
  const duration = minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
  return h('details', { class: 'title-records-run', attrs: index === 0 ? { open: '' } : undefined },
    h('summary', {},
      h('span', { class: 'title-records-run-summary' },
        h('strong', { text: run.stage > 0 ? `${run.stage}단계` : '준비' }),
        h('time', { text: duration, attrs: { datetime: `PT${run.durationSeconds}S` } }),
      ),
    ),
    h('div', { class: 'title-records-run-bosses' },
      run.bosses.length ? h('p', { text: `단계 보스 · ${run.bosses.join(', ')}` }) : null,
      run.challenges.length ? h('p', { text: `도전 보스 · ${run.challenges.join(', ')}` }) : null,
      run.bosses.length + run.challenges.length === 0 ? h('p', { text: '처치한 보스 없음' }) : null,
    ),
  );
}

export function createRecordsDialog(records: BattleRecordsView): HTMLDialogElement {
  const panel = h('dialog', {
    class: 'title-confirm title-records-panel',
    attrs: { 'aria-labelledby': 'battle-records-title' },
  },
    h('header', { class: 'title-records-header' },
      h('h2', { attrs: { id: 'battle-records-title' }, text: '전투 기록' }),
      h('button', { class: 'btn btn-chip', text: '닫기', attrs: { type: 'button', autofocus: '' }, on: { click: () => panel.close() } }),
    ),
    h('div', { class: 'title-records-body' },
      h('p', { class: 'title-records-best' },
        h('span', { text: '최고 도달 단계' }),
        h('strong', { text: records.bestStage > 0 ? `${records.bestStage}단계` : '기록 없음' }),
      ),
      h('section', { class: 'title-records-group', attrs: { 'aria-labelledby': 'recent-runs-title' } },
        h('h3', { attrs: { id: 'recent-runs-title' }, text: '최근 5판' }),
        records.recent.length > 0
          ? h('p', { class: 'title-records-note', text: '플레이 시간은 배속이 반영된 게임 시간이에요.' })
          : h('p', { text: '무한 모드에서 판이 끝나면 여기에 표시돼요.' }),
        ...records.recent.map(runDetails),
      ),
      bossRecords('처치한 단계 보스', records.bosses),
      bossRecords('처치한 도전 보스', records.challenges),
      records.bosses.length + records.challenges.length === 0
        ? h('p', { text: '아직 처치한 보스가 없어요.' })
        : null,
    ),
  );
  return panel;
}
