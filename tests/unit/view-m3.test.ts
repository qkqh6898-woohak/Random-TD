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
import { buildHudModel, mergeReadyText, summonInfo } from '../../src/ui/hud/hudModel';
import { mergeFailText, mergeReadyToast } from '../../src/ui/messages';
import { choosePanelPlacement } from '../../src/ui/panels/TowerPanel';
import {
  buildTowerPanelModel,
  detectText,
  fmtNum,
  fmtPct,
  fmtScaled2,
  gradeStars,
  mergeNextText,
  shapeText,
  shortFactionName,
  type TowerPanelInput,
} from '../../src/ui/panels/towerPanelModel';
import {
  DRAG_LIFT_TILES,
  LONG_PRESS_MS,
  PRESS_SLOP_TILES,
  dragAim,
  dragFootPx,
  dropPreview,
  inputLocked,
  isTap,
  pressPhase,
  releaseAction,
} from '../../src/view/input/press';
import { pxToTile, type MapLayout } from '../../src/view/layout';
import { FIGURE_BOTTOM_TILES, FIGURE_TOP_TILES, FOOT_OFFSET_TILES, towerFigureSpanTiles } from '../../src/view/render/towerGeom';
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

  it('놓을 칸 = 원래 칸 중심 + 손가락이 움직인 만큼: 캐릭터 얼굴·머리를 눌러 들어도 움직이지 않으면 제자리 (검토 반영)', () => {
    const L: MapLayout = { tile: 100, originX: 0, originY: 0, minCol: 0, minRow: 0, cols: 9, rows: 11 };
    const center = { x: 250, y: 350 }; // 칸 (2, 3)
    // 칸 중심보다 0.25칸·0.6칸 위(얼굴·머리)를 누르고 그대로 → 제자리 칸 (예전: 손가락 − 0.45칸을 노려 위 칸으로 옮겨짐)
    for (const dy of [-25, -60, 10, 45]) {
      const down = { x: 250, y: 350 + dy };
      expect(pxToTile(L, dragAim(center, down, down).x, dragAim(center, down, down).y)).toEqual({ tx: 2, ty: 3 });
    }
    // 한 칸 위로 끌면 위 칸, 오른쪽으로 두 칸 끌면 오른쪽 둘째 칸 (누른 자리와 무관)
    const down = { x: 250, y: 325 };
    const up = dragAim(center, down, { x: 250, y: 225 });
    expect(pxToTile(L, up.x, up.y)).toEqual({ tx: 2, ty: 2 });
    const right = dragAim(center, down, { x: 450, y: 325 });
    expect(pxToTile(L, right.x, right.y)).toEqual({ tx: 4, ty: 3 });
    // 그림은 노리는 점에서 0.45칸 들어 올려 그린다 (발밑 = 중심 + 0.3칸 − 0.45칸)
    expect(dragFootPx({ x: 250, y: 350 }, 100)).toEqual({ x: 250, y: 350 + 100 * (FOOT_OFFSET_TILES - DRAG_LIFT_TILES) });
  });

  it('끌기를 놓을 때: 이동·교환 = move, 제자리에서 거의 안 움직임 = 느린 탭(패널), 그 밖 = 아무것도 안 함', () => {
    const tile = 100;
    expect(releaseAction('move', 300, tile)).toBe('move');
    expect(releaseAction('swap', 300, tile)).toBe('move');
    expect(releaseAction('none', 0, tile)).toBe('tap');
    expect(releaseAction('none', 30, tile)).toBe('tap');
    expect(releaseAction('none', 31, tile)).toBe('none'); // 끌었다가 제자리로 돌아옴
    expect(releaseAction('invalid', 0, tile)).toBe('none');
    expect(releaseAction(null, 0, tile)).toBe('none'); // 맵 밖
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
    expect(m.abilityLabel).toBe('특색');
    expect(m.target).toBe('선두');
  });

  it('사거리 강화(M5-3)가 붙으면 패널 사거리도 실제 값 + 기본값 (M5 검토 반영), 맵 전체는 그대로', () => {
    const stats = rules.towers.get('apprentice')!;
    const mods = { ...newPlayerMods(), rangePctBp: 2000 };
    const m = buildTowerPanelModel(panelInput('apprentice', { eff: effectiveStats(rules, stats, mods) }));
    expect(m.stats.flat().find((c) => c.label === '사거리')).toEqual({ label: '사거리', value: '3', buffed: true, base: '2.5' });
    const small = buildTowerPanelModel(panelInput('apprentice', { eff: effectiveStats(rules, stats, { ...newPlayerMods(), rangePctBp: 200 }) }));
    expect(small.stats.flat().find((c) => c.label === '사거리')).toMatchObject({ value: '2.55', base: '2.5' });
    expect(buildTowerPanelModel(panelInput('apprentice')).stats.flat().find((c) => c.label === '사거리')).toEqual({ label: '사거리', value: '2.5', buffed: false });
  });

  it('[⬆ 승급 가능 n]으로 연 패널: 묶음 2개 이상이면 [다음 묶음 ▶ 1/3] (M5 검토 반영), 아니면 숨김', () => {
    expect(mergeNextText(null)).toBe('');
    expect(mergeNextText({ index: 0, total: 1 })).toBe('');
    expect(mergeNextText({ index: 0, total: 3 })).toBe('다음 묶음 ▶ 1/3');
    expect(mergeNextText({ index: -1, total: 2 })).toBe('다음 묶음 ▶');
    expect(buildTowerPanelModel(panelInput('archer', { mergeCycle: { index: 1, total: 2 } })).mergeNext).toBe('다음 묶음 ▶ 2/2');
    expect(buildTowerPanelModel(panelInput('archer')).mergeNext).toBe('');
  });

  it('특색이 아닌 타워도 능력 설명이 있으면 "능력" 줄에 보여준다 (화염 마법사 화상·군견병 출혈·단일딜 전사·바람 궁수, 검토 반영)', () => {
    expect(buildTowerPanelModel(panelInput('flamemage'))).toMatchObject({ abilityLabel: '능력', ability: tower('flamemage').ability });
    expect(buildTowerPanelModel(panelInput('flamemage')).ability).toContain('화상');
    expect(buildTowerPanelModel(panelInput('k9')).ability).toContain('출혈');
    expect(buildTowerPanelModel(panelInput('duelist')).ability).toContain('치명타');
    expect(buildTowerPanelModel(panelInput('windarcher')).ability).toContain('넉백');
    // 특색 타워는 '특색'
    expect(buildTowerPanelModel(panelInput('warlord', { outcomes: [] })).abilityLabel).toBe('특색');
  });

  it('부제의 종족 이름은 괄호 설명을 뺀다 (좁은 화면에서 특색 태그가 잘리지 않게)', () => {
    expect(shortFactionName('카라쉬 부족 (오크·고블린)')).toBe('카라쉬 부족');
    expect(shortFactionName('실바렌 엘프')).toBe('실바렌 엘프');
    const m = buildTowerPanelModel(panelInput('warlord', { factionName: '카라쉬 부족 (오크·고블린)', outcomes: [] }));
    expect(m.subtitle).toBe(`레전드 · 카라쉬 부족 · 물리 · ${tower('warlord').tags[0]}`);
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

  it('공속·배율은 소수 둘째 자리까지 (검토 반영): 전쟁 군주 +15% → 저격수 0.35 (×1.15) (0.3) — 예전엔 0.3 (×1.2) (0.3)', () => {
    const stats = rules.towers.get('sniper')!;
    const eff = effectiveStats(rules, stats, newPlayerMods(), { atkPctBp: 0, apsPctBp: 1500, bossMulBp: 10_000 });
    expect(eff.apsMilli).toBe(345);
    const cellOf = (m: ReturnType<typeof buildTowerPanelModel>) => m.stats.flat().find((c) => c.label === '공속');
    expect(cellOf(buildTowerPanelModel(panelInput('sniper', { eff })))).toMatchObject({ value: '0.35 (×1.15)', buffed: true, base: '0.3' });
    // 전사 0.6 → 0.69, 버프 없으면 그대로 0.6 (×1)
    const w = rules.towers.get('warrior')!;
    const effW = effectiveStats(rules, w, newPlayerMods(), { atkPctBp: 0, apsPctBp: 1500, bossMulBp: 10_000 });
    expect(cellOf(buildTowerPanelModel(panelInput('warrior', { eff: effW })))).toMatchObject({ value: '0.69 (×1.15)', base: '0.6' });
    expect(cellOf(buildTowerPanelModel(panelInput('warrior')))).toEqual({ label: '공속', value: '0.6 (×1)', buffed: false });
    expect([fmtScaled2(345, 1000), fmtScaled2(11_500, 10_000), fmtScaled2(800, 1000), fmtScaled2(2000, 1000), fmtScaled2(1150, 1000)]).toEqual([
      '0.35',
      '1.15',
      '0.8',
      '2',
      '1.15',
    ]);
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

  it('패널 자리: 고른 타워 그림과 겹치지 않는 쪽 (아래 우선), 어느 쪽도 안 되면 접기 1·2단계, 그래도 안 되면 덜 겹치는 쪽 (검토 반영)', () => {
    // 무대: 위에 붙이면 280부터, 아래에 붙이면 817까지. 패널 높이 접기 0/1/2 = 322/280/233
    const heights = [322, 280, 233];
    const at = (top: number, bottom: number) => choosePanelPlacement(heights, { top, bottom }, 280, 817);
    expect(at(286, 339)).toEqual({ side: 'bottom', density: 0, overlap: 0 }); // 맨 윗줄
    expect(at(690, 743)).toEqual({ side: 'top', density: 0, overlap: 0 }); // 맨 아랫줄
    expect(at(448, 501)).toEqual({ side: 'bottom', density: 1, overlap: 0 }); // 4줄: 다 펴면 아래 패널(495~)과 겹침
    expect(at(529, 582)).toEqual({ side: 'bottom', density: 2, overlap: 0 }); // 6줄 (예전: 위 패널에 83% 가려짐)
    expect(at(569, 622)).toEqual({ side: 'top', density: 1, overlap: 0 });
    // 어디에도 안 들어가면 가장 많이 접은 단계에서 덜 겹치는 쪽
    expect(choosePanelPlacement(heights, { top: 400, bottom: 700 }, 280, 817)).toEqual({ side: 'top', density: 2, overlap: 113 });
    expect(choosePanelPlacement(heights, { top: 300, bottom: 600 }, 280, 817)).toEqual({ side: 'bottom', density: 2, overlap: 16 });
  });

  it('타워 그림 세로 범위: 머리·별(+ 대기 동작 여유) ~ 받침대 아래', () => {
    const span = towerFigureSpanTiles();
    expect(span.top).toBeLessThan(FIGURE_TOP_TILES);
    expect(span.top).toBeCloseTo(-0.836, 2);
    expect(span.bottom).toBe(FIGURE_BOTTOM_TILES);
    expect(span.bottom).toBeCloseTo(0.475, 2);
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

  it('아래 띠 소환 안내: 늘 짧게 "소환 · 100원", [⬆ 승급 가능 n]이 보이면 비운다 (M4 고용 버튼과 같은 줄 — 잘리지 않게)', () => {
    expect(summonInfo(1000, 3, 71, 100, true).summonHint).toBe('');
    expect(summonInfo(1000, 3, 71, 100, false).summonHint).toBe(''); // T-2: 비용은 [🎲 소환] 버튼에
    // 가득 차도 승급 버튼이 보이면 비운다 (검토 반영: '빈 칸이 없어요'가 '빈 칸…'으로 잘리던 것), 버튼이 없으면 그대로
    expect(summonInfo(1000, 71, 71, 100, true).summonHint).toBe('');
    expect(summonInfo(1000, 71, 71, 100, false).summonHint).toBe('빈 칸이 없어요');
    const m = infinite(3);
    const hud = (mergeReady: number) =>
      buildHudModel({ state: m.state, ticksLeft: 100, mobCount: 0, tick: 0, speed: 1, towerCount: 3, buildableCount: 71, summonCost: 100, mergeReady }, data.game.hud);
    expect(hud(0).summonHint).toBe('');
    expect(hud(0).summonCost).toBe('100원');
    expect(hud(2).summonHint).toBe('');
  });

  it('문구: 승급 가능 · 승급 실패', () => {
    expect(mergeReadyToast('궁수')).toBe('궁수 승급 가능!');
    // 한 프레임에 여러 종류가 승급 가능해지면 알림 하나로 (검토 반영)
    expect(mergeReadyToast(['고블린', '전사'])).toBe('고블린·전사 승급 가능!');
    expect(mergeReadyToast(['고블린', '전사', '견습 마법사'])).toBe('고블린 외 2종 승급 가능!');
    expect(mergeFailText('count', 3)).toBe('같은 타워가 3개 있어야 승급할 수 있어요');
    expect(mergeFailText('maxGrade', 3)).toContain('레전드');
    expect(mergeFailText('noTower', 3)).toBeNull();
  });
});

describe('정보 패널: 쉬는 이유 (M4 혼돈의 용 기절)', () => {
  it('이동 직후 = "이동 중", 기절 = "💫 기절" (기절이 먼저), 둘 다 아니면 숨김', () => {
    expect(buildTowerPanelModel(panelInput('archer', { paused: true }))).toMatchObject({ paused: true, pausedText: '이동 중' });
    expect(buildTowerPanelModel(panelInput('archer', { paused: true, stunned: true }))).toMatchObject({ paused: true, pausedText: '💫 기절' });
    expect(buildTowerPanelModel(panelInput('archer', { stunned: true }))).toMatchObject({ paused: true, pausedText: '💫 기절' });
    expect(buildTowerPanelModel(panelInput('archer'))).toMatchObject({ paused: false, pausedText: '' });
  });
});
