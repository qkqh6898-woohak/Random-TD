/**
 * 피드백 #29 '종족 소환은 일단 작게': [🎰 도박] 시트 '✨ 소환 도박'에서 종족 소환 줄만 작게(덜 눈에 띄게) 표시한다.
 * 규칙·확률·비용은 그대로. 이슈에 판 기록 JSON이 없어 리플레이 테스트는 없다.
 * v0.1.14 통합: 모양은 디자인 PR #54(FB-D1 #29) — 종족 줄(faction)만 `sm-row-secondary` + 접힌 종족 선택. PR #35의 `compact`·`is-compact`는 겹쳐서 뺐다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { summonSheetModel } from '../../src/ui/sheets/g1Models';
import { buildMatchRules } from '../../src/sim/rules';
import { data, realInfinite } from '../helpers/match';

const rules = buildMatchRules(data);

describe('피드백 #29 종족 소환 줄 작게', () => {
  const m = realInfinite(29);
  const factions = rules.factionOrder.map((id) => ({ id, name: id, color: '#fff' }));
  const model = summonSheetModel(m.ctx, m.world, 0, factions, 0, data.game.summonGamble.kinds);

  it('종족 소환 줄만 보조 줄(faction), 나머지 소환 도박 줄은 그대로', () => {
    expect(model.rows.map((r) => [r.id, r.faction])).toEqual([
      ['lucky', false],
      ['faction', true],
      ['challenge', false],
      ['myth', false],
    ]);
  });

  it('종족 소환의 비용·확률·천장은 game.json 그대로', () => {
    const row = model.rows.find((r) => r.id === 'faction')!;
    const kind = data.game.summonGamble.kinds.find((k: { id: string }) => k.id === 'faction')!;
    expect(row.cost).toBe(kind.cost);
    expect(row.costText).toBe('400원'); // V2.0 PR-A 소환 도박 ×2
    expect(row.odds.replace(/\u00a0/g, ' ')).toBe('노말 70% · 레어 30%');
    expect(row.pity).toBe('천장까지 10회 (레어)');
  });

  it('작은 줄 CSS가 있다 (FB-D1 보조 줄: 그림·글자를 줄이고 버튼은 44px)', () => {
    const css = readFileSync(new URL('../../src/ui/feedback-design.css', import.meta.url), 'utf8');
    for (const sel of ['.sm-row-secondary', '.sm-row-secondary > .up-icon', '.sm-row-secondary .up-name', '.sm-row-secondary .sm-buy', '.sm-faction-picker']) {
      expect(css.includes(sel), sel).toBe(true);
    }
  });
});
