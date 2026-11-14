/**
 * M3a 화면 쪽 순수 계산: 누르기 → 탭/끌기/취소(0.3초·0.3칸), 놓을 칸 미리 보기(이동·교환·불가), 승급 뒤 입력 잠금,
 * 타워 정보 패널 글자·버튼 상태(UI.md 4.4), 아래 띠 '⬆ 승급 가능 n', 승급 묶음 세기, 승급 알림 문구.
 */
import { describe, expect, it } from 'vitest';
import { buildMatchRules } from '../../src/sim/rules';
import { effectiveStats, newPlayerMods } from '../../src/sim/stats';
import { mergeableGroups } from '../../src/sim/systems/Merge';
import { moveCheck } from '../../src/sim/systems/Move';
import { placeTower } from '../../src/sim/systems/Summon';
import { buildHudModel, mergeReadyText } from '../../src/ui/hud/hudModel';
import { mergeFailText, mergeReadyToast } from '../../src/ui/messages';
import { panelSideFor } from '../../src/ui/panels/TowerPanel';
import {
  buildTowerPanelModel,
  detectText,
  fmtNum,
  fmtPct,
  gradeStars,
  shapeText,
  type TowerPanelInput,
} from '../../src/ui/panels/towerPanelModel';
import {
  LONG_PRESS_MS,
  PRESS_SLOP_TILES,
  dropPreview,
  inputLocked,
  isTap,
  pressPhase,
} from '../../src/view/input/press';
import { data, infinite } from '../helpers/match';

const rules = buildMatchRules(data);
const tower = (id: string) => data.towers.towers.find((t) => t.id === id)!;

function panelInput(id: string, extra: Partial<TowerPanelInput> = {}): TowerPanelInput {
  const stats = rules.towers.get(id)!;
  return {
    data: tower(id),
    stats,
    eff: effectiveStats(rules, stats),
    factionName: '왕국',
    owned: 1,
    mergeCount: 3,
    mergeableGrade: stats.grade !== 'legend' && stats.grade !== 'god' && stats.grade !== 'hidden',
    outcomes: ['상인', '진흙 주술사'],
    paused: false,
    penMaxBp: rules.penMaxBp,
    ...extra,
  };
}

describe('누르기 판정 (M3-10, UI.md 4.3)', () => {
  const tile = 100;
  it('0.3초 전에 떼면 탭, 0.3초가 되면 끌기, 그 전에 0.3칸 넘게 움직이면 취소', () => {
    expect(LONG_PRESS_MS).toBe(300);
    expect(PRESS_SLOP_TILES).toBe(0.3);
    expect(pressPhase(100, 5, tile, false)).toBe('pending');
    expect(pressPhase(299, 30, tile, false)).toBe('pending');
    expect(pressPhase(300, 0, tile, false)).toBe('drag');
    expect(pressPhase(150, 31, tile, false)).toBe('cancel');
    expect(pressPhase(10, 500, tile, true)).toBe('drag'); // 끌기 중에는 움직여도 계속
    expect(isTap(120, 10, tile)).toBe(true);
    expect(isTap(320, 0, tile)).toBe(false);
    expect(isTap(120, 40, tile)).toBe(false);
  });

  it('놓을 칸 미리 보기: 빈 칸 = move, 내 타워 = swap, 같은 칸 = none, 경로·남의 타워 = invalid', () => {
    const m = infinite(1, { players: 2 });
    placeTower(m.world, 'archer', 0, 4, 0);
    placeTower(m.world, 'goblin', 0, 6, 0);
    placeTower(m.world, 'goblin', 1, 2, 2);
    expect(dropPreview(moveCheck(m.ctx, m.world, 0, 4, 0, 5, 0))).toBe('move');
    expect(dropPreview(moveCheck(m.ctx, m.world, 0, 4, 0, 6, 0))).toBe('swap');
    expect(dropPreview(moveCheck(m.ctx, m.world, 0, 4, 0, 4, 0))).toBe('none');
    expect(dropPreview(moveCheck(m.ctx, m.world, 0, 4, 0, 1, 1))).toBe('invalid');
    expect(dropPreview(moveCheck(m.ctx, m.world, 0, 4, 0, 2, 2))).toBe('invalid');
  });

  it('승급 뒤 입력 잠금 0.3초', () => {
    expect(inputLocked(null, 1000)).toBe(false);
    expect(inputLocked(1300, 1299)).toBe(true);
    expect(inputLocked(1300, 1300)).toBe(false);
  });
});

describe('타워 정보 패널 (M3-11, UI.md 4.4)', () => {
  it('글자 도우미: 별·숫자·퍼센트·범위·감지', () => {
    expect(gradeStars('unique')).toBe('★★★');
    expect(gradeStars('god')).toBe('👑');
    expect(gradeStars('hidden')).toBe('💠');
    expect(fmtNum(6.5)).toBe('6.5');
    expect(fmtNum(7)).toBe('7');
    expect(fmtNum(0.8)).toBe('0.8');
    expect(fmtPct(3000)).toBe('30%');
    expect(fmtPct(0)).toBe('—');
    expect(shapeText('melee', 0)).toBe('근접 단일');
    expect(shapeText('aoe', 0.8)).toBe('광역 r0.8');
    expect(shapeText('melee_aoe', 1.2)).toBe('근접 광역 r1.2');
    expect(shapeText('pierce', 2)).toBe('관통 2');
    expect(shapeText('chain', 3)).toBe('연쇄 3');
    expect(shapeText('multi', 5)).toBe('다중 5');
    expect(shapeText('global', 0)).toBe('전체');
    expect(detectText(tower('assassin'))).toBe('오라 r3');
    expect(detectText(tower('sniper'))).toBe('자신');
    expect(detectText(tower('celestial'))).toBe('오라 (맵 전체)');
    expect(detectText(tower('archer'))).toBe('없음');
  });

  it('견습 마법사: 마법 6.5, 공속 0.8 (×1), 사거리 2.5, 광역 r0.8, 보유 1/3 → 승급 꺼짐 + 안내', () => {
    const m = buildTowerPanelModel(panelInput('apprentice'));
    expect(m).toMatchObject({ name: '견습 마법사', stars: '★', level: 'Lv1', owned: '1/3', mergeEnabled: false, mergeAllEnabled: false });
    expect(m.subtitle).toBe('노말 · 왕국 · 마법');
    const flat = m.stats.flat();
    expect(flat.find((c) => c.label === '물리')!.value).toBe('—');
    expect(flat.find((c) => c.label === '마법')!.value).toBe('6.5');
    expect(flat.find((c) => c.label === '공속')!.value).toBe('0.8 (×1)');
    expect(flat.find((c) => c.label === '사거리')!.value).toBe('2.5');
    expect(flat.find((c) => c.label === '범위')!.value).toBe('광역 r0.8');
    expect(m.note).toBe('같은 타워 3개가 모이면 승급할 수 있어요');
    expect(m.outcomes).toBe('상인 · 진흙 주술사');
    expect(m.ability).toBe('—');
    expect(m.target).toBe('선두');
  });

  it('보유 3개 이상이면 승급·모두 승급 켜짐, 7개면 모두 승급 ×2', () => {
    expect(buildTowerPanelModel(panelInput('archer', { owned: 3 }))).toMatchObject({ mergeEnabled: true, mergeAllEnabled: true, mergeAllTimes: 1, ownedReady: true, note: '' });
    expect(buildTowerPanelModel(panelInput('archer', { owned: 7 }))).toMatchObject({ owned: '7/3', mergeAllTimes: 2 });
  });

  it('레전드는 3개여도 승급 꺼짐 + "레전드는 승급할 수 없어요", 결과 미리 보기 없음', () => {
    const m = buildTowerPanelModel(panelInput('warlord', { owned: 3, outcomes: [] }));
    expect(m).toMatchObject({ stars: '★★★★★', mergeEnabled: false, mergeAllEnabled: false, outcomes: '' });
    expect(m.note).toContain('레전드는 승급할 수 없어요');
    expect(m.ability).toContain('전체 타워 공격속도');
  });

  it('관통·치명타·감지·특색: 저격수 방관 40% · 치명 30% ×3 · 감지 자신 · 대상 최대 체력', () => {
    const m = buildTowerPanelModel(panelInput('sniper'));
    const flat = m.stats.flat();
    expect(flat.find((c) => c.label === '방관')!.value).toBe('40%');
    expect(flat.find((c) => c.label === '마관')!.value).toBe('—');
    expect(flat.find((c) => c.label === '치명')!.value).toBe('30% ×3');
    expect(m.detect).toBe('자신');
    expect(m.target).toBe('최대 체력');
  });

  it('버프로 오른 값은 초록 + (기본값): 공격력 +50%·공속 +100% → 물리 15 (10), 공속 2 (×2) (1)', () => {
    const stats = rules.towers.get('archer')!;
    const eff = effectiveStats(rules, stats, { ...newPlayerMods(), atkPctBp: 5000, apsPctBp: 10_000 });
    const m = buildTowerPanelModel(panelInput('archer', { eff }));
    const flat = m.stats.flat();
    expect(flat.find((c) => c.label === '물리')).toMatchObject({ value: '15', buffed: true, base: '10' });
    expect(flat.find((c) => c.label === '공속')).toMatchObject({ value: '2 (×2)', buffed: true, base: '1' });
  });

  it('신·고정 피해: 파멸의 신 고정 2400 · 범위 전체 · 사거리 맵 전체', () => {
    const m = buildTowerPanelModel(panelInput('ruin', { mergeableGrade: false }));
    const flat = m.stats.flat();
    expect(flat.find((c) => c.label === '고정')!.value).toBe('2400');
    expect(flat.find((c) => c.label === '범위')!.value).toBe('전체');
    expect(flat.find((c) => c.label === '사거리')!.value).toBe('맵 전체');
    expect(m.stars).toBe('👑');
    expect(m.note).toBe('이 타워는 승급할 수 없어요');
  });

  it('패널 위치: 타워가 화면 아래쪽(55% 아래)이면 위에, 아니면 아래에', () => {
    expect(panelSideFor(0.3)).toBe('bottom');
    expect(panelSideFor(0.55)).toBe('bottom');
    expect(panelSideFor(0.7)).toBe('top');
  });
});

describe('아래 띠 승급 버튼·알림 (UI.md 4.1·8장)', () => {
  it('mergeReadyText: 0이면 숨김(빈 글자), n이면 "⬆ 승급 가능 n"', () => {
    expect(mergeReadyText(0)).toBe('');
    expect(mergeReadyText(2)).toBe('⬆ 승급 가능 2');
    const m = infinite(1);
    const model = buildHudModel(
      { state: m.state, ticksLeft: 100, mobCount: 0, tick: 0, speed: 1, mergeReady: 3 },
      data.game.hud,
    );
    expect(model.mergeReady).toBe('⬆ 승급 가능 3');
  });

  it('mergeableGroups: 같은 종류 3개 이상 + 승급 가능한 등급만, 가장 먼저 소환된 타워 순', () => {
    const m = infinite(2);
    const cells = m.map.buildable.slice(0, 12);
    const put = (id: string, i: number) => placeTower(m.world, id, 0, cells[i]![0], cells[i]![1]);
    put('goblin', 0);
    put('archer', 1);
    put('archer', 2);
    put('goblin', 3);
    put('archer', 4);
    put('goblin', 5);
    put('warlord', 6);
    put('warlord', 7);
    put('warlord', 8);
    put('miner', 9);
    put('miner', 10);
    const groups = mergeableGroups(m.ctx, m.world, 0);
    expect(groups.map((g) => [g.tower, g.count])).toEqual([
      ['goblin', 3],
      ['archer', 3],
    ]);
    expect(groups[0]!.first.tx).toBe(cells[0]![0]);
    expect(mergeableGroups(m.ctx, m.world, 1)).toEqual([]);
  });

  it('문구: 승급 가능 · 승급 실패', () => {
    expect(mergeReadyToast('궁수')).toBe('궁수 승급 가능!');
    expect(mergeFailText('count', 3)).toBe('같은 타워가 3개 있어야 승급할 수 있어요');
    expect(mergeFailText('maxGrade', 3)).toContain('레전드');
    expect(mergeFailText('noTower', 3)).toBeNull();
  });
});
