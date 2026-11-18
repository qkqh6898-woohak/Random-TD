/**
 * 피드백 #23 '등급 이름 통일': 화면에 보이는 등급 이름을 한 가지 표기로 맞춘다.
 * 정답 표기 = 노말 · 레어 · 유니크 · 히어로 · 레전드 · 신 · 신화(히든 등급). 등급 ID·저장 형식은 그대로.
 * ('영웅'은 캐릭터를 부르는 말로만 쓴다 — 등급 이름으로 쓰지 않는다.)
 */
import { describe, expect, it } from 'vitest';
import { loadGameData, type Grade } from '../../src/data/load';
import { loadProgression } from '../../src/meta/progressionData';
import { GRADE_NAMES } from '../../src/ui/panels/towerPanelModel';
import { GRADE_KO } from '../../src/ui/lobby/lobbyModel';
import { GACHA_GRADE_NAMES } from '../../src/ui/sheets/g1Models';
import { upgradeSheetModel } from '../../src/ui/sheets/sheetModels';
import { createMatch } from '../../src/sim/match';

const CANON: Record<Grade, string> = { normal: '노말', rare: '레어', unique: '유니크', hero: '히어로', legend: '레전드', god: '신', hidden: '신화' };
/** 등급을 가리키는 다른 표기 (섞이면 안 되는 말) */
const OTHER_GRADE_WORDS = /일반 강화|영웅 강화|전설|노멀|에픽|레젼드/;

const data = loadGameData();

describe('피드백 #23 등급 이름 통일', () => {
  it('화면의 등급 이름 표가 모두 같은 표기', () => {
    expect({ ...GRADE_NAMES }).toEqual(CANON);
    expect({ ...GRADE_KO }).toEqual(CANON);
    const { none: _none, ...gacha } = GACHA_GRADE_NAMES;
    expect(gacha).toEqual(CANON);
  });

  it('등급 강화 이름 = 대상 등급 이름 + 강화 (일반·영웅·전설 강화 → 노말·레어 / 유니크·히어로 / 레전드·신·신화)', () => {
    const names = data.game.upgrade.grade.map((g) => g.name);
    expect(names).toEqual(['노말·레어 강화', '유니크·히어로 강화', '레전드·신·신화 강화']);
    for (const g of data.game.upgrade.grade) {
      expect(g.name).toBe(`${g.grades.map((x) => CANON[x]).join('·')} 강화`);
    }
    // id는 그대로 (저장·명령이 쓰는 값)
    expect(data.game.upgrade.grade.map((g) => g.id)).toEqual(['normal', 'hero', 'legend']);
  });

  it('강화 시트 줄 이름도 같은 표기', () => {
    const m = createMatch(data, { seed: 1, mode: 'infinite' });
    const model = upgradeSheetModel(m.ctx, 0);
    for (const r of model.grade) expect(r.name).not.toMatch(OTHER_GRADE_WORDS);
    expect(model.grade.map((r) => r.name)[0]).toBe('노말·레어 강화');
  });

  it('미션·상점 글자에 다른 등급 표기가 없다', () => {
    for (const m of data.missions.missions) {
      expect(m.name, m.id).not.toMatch(OTHER_GRADE_WORDS);
      expect(m.desc, m.id).not.toMatch(OTHER_GRADE_WORDS);
    }
    const pd = loadProgression(data);
    for (const it of pd.shop) {
      expect(it.name, it.id).not.toMatch(OTHER_GRADE_WORDS);
      expect(it.desc, it.id).not.toMatch(OTHER_GRADE_WORDS);
    }
    expect(pd.shop.find((x) => x.id === 'chest-legend')?.name).toBe('레전드 상자');
  });
});
