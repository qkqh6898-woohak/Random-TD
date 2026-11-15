/**
 * M4 화면 쪽 순수 계산: 고르기 창 내용(카드·승급의 축복), 몹 겉모습(드러남·정예·날기·피해 감소·보호막), 크기 배율, 문구.
 */
import { describe, expect, it } from 'vitest';
import { emptyMobTraits } from '../../src/sim/entities/Mob';
import { buildMatchRules } from '../../src/sim/rules';
import { cardChoiceModel, mergeChoiceModel } from '../../src/ui/panels/choiceModel';
import { BOSS_CLEARED, bossNameplate, bossTag, formationBanner, hireFailText, workerFullText } from '../../src/ui/messages';
import { NO_LOOK, mobLookView, mobScaleMul } from '../../src/view/render/statusModel';
import { data } from '../helpers/match';

const rules = buildMatchRules(data);
const look = (o: Partial<ReturnType<typeof emptyMobTraits> & { invisible: boolean }> = {}) => ({ invisible: false, ...emptyMobTraits(), ...o });

describe('고르기 창 내용 (choiceModel)', () => {
  it('보스 카드 묶음 → 3장 (이름·설명·일반/희귀 표시·그림), 같은 묶음이면 같은 key', () => {
    const offer = { player: 0, boss: 2, cards: ['atkAll', 'godGaze', 'fund'] };
    const m = cardChoiceModel(rules, offer);
    expect(m.kind).toBe('card');
    expect(m.title).toBe('👑 보스 처치! 카드 1장을 고르세요');
    expect(m.sub).toContain('20단계');
    expect(m.options.map((o) => [o.title, o.badge, o.rare])).toEqual([
      ['전군 강화', '일반', false],
      ['신의 눈길', '희귀', true],
      ['긴급 자금', '일반', false],
    ]);
    expect(m.options[0]!.desc).toBe('모든 타워 공격력 +20% (이번 판 영구)');
    expect(cardChoiceModel(rules, { ...offer }).key).toBe(m.key);
    expect(cardChoiceModel(rules, { ...offer, boss: 3 }).key).not.toBe(m.key);
  });

  it('승급의 축복 → [지금 결과 그대로] [바꾸기] 2개, 등급 이름', () => {
    const m = mergeChoiceModel(rules, { player: 0, id: 12, alt: 'cleaver' }, 'mudshaman');
    expect(m.kind).toBe('merge');
    expect(m.sub).toContain('레어');
    expect(m.options.map((o) => [o.title, o.badge, o.current])).toEqual([
      ['진흙 주술사', '지금', true],
      ['광역딜 전사', '바꾸기', false],
    ]);
    expect(m.key).toBe('merge:12:cleaver');
  });
});

describe('몹 겉모습 (mobLookView)', () => {
  it('아무것도 없으면 같은 객체(NO_LOOK)', () => {
    expect(mobLookView(look(), 10)).toBe(NO_LOOK);
  });

  it('투명 몹은 드러남 시간 안에서만 revealed (보라 외곽선)', () => {
    expect(mobLookView(look({ invisible: true, revealedUntil: 11 }), 10).revealed).toBe(true);
    expect(mobLookView(look({ invisible: true, revealedUntil: 10 }), 10).revealed).toBe(false);
    // 투명이 아닌 몹은 revealedUntil과 무관
    expect(mobLookView(look({ invisible: false, revealedUntil: 99 }), 10)).toBe(NO_LOOK);
  });

  it('정예·날기·피해 감소·보호막 비율', () => {
    const v = mobLookView(look({ elite: true, flyUntil: 20, dmgCutBp: 5000, shield: 30, maxShield: 120 }), 10);
    expect(v).toEqual({ revealed: false, elite: true, flying: true, guard: true, shield: 0.25 });
    expect(mobLookView(look({ flyUntil: 10 }), 10).flying).toBe(false);
  });

  it('크기 배율: 정예 ×1.3, 작은 조각 ×0.62, 보스 분열 조각 ×0.8', () => {
    expect(mobScaleMul({ elite: false, small: false, part: false }, 1.3)).toBe(1);
    expect(mobScaleMul({ elite: true, small: false, part: false }, 1.3)).toBe(1.3);
    expect(mobScaleMul({ elite: false, small: true, part: false }, 1.3)).toBeCloseTo(0.62);
    expect(mobScaleMul({ elite: false, small: false, part: true }, 1.3)).toBeCloseTo(0.8);
  });
});

describe('M4 문구 (UI.md 8장)', () => {
  it('일꾼 실패: 최대 / 모자란 만큼', () => {
    expect(workerFullText(10)).toBe('일꾼이 꽉 찼어요 (10/10)');
    expect(hireFailText('max', 300, 5000, 10)).toBe('일꾼이 꽉 찼어요 (10/10)');
    expect(hireFailText('gold', 300, 120, 10)).toBe('180원이 더 필요해요');
    expect(hireFailText('phase', 300, 0, 10)).toBeNull();
  });

  it('보스 이름표: 군단 · 계급 「이름」 (군주 직속은 계급만), 처치 뒤 문구', () => {
    expect(bossNameplate(bossTag('질풍 군단', '대장'), '박쥐 여왕')).toBe('질풍 군단 · 대장 「박쥐 여왕」');
    expect(bossNameplate(bossTag('군주 직속', '군주 직속 대장'), '혼돈의 용')).toBe('군주 직속 대장 「혼돈의 용」');
    expect(BOSS_CLEARED).toContain('보스 처치');
  });

  it('편대 예고 배너', () => {
    const f = rules.formations[0]!;
    expect(formationBanner(f.name, f.banner)).toBe('⚠ 다음 단계: 돌파 편대 — 보석 골렘 + 암흑 고블린 떼!');
  });
});
