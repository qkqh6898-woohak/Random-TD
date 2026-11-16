/**
 * M1-8 HUD 표시값 (값이 sim과 일치) + M1-7 맵 화면 배치 (순수 함수, DOM·Phaser 없음).
 */
import { describe, expect, it } from 'vitest';
import { bossHudInput, buildHudModel, defeatText, formatGold, formatStage, formatTimer, livesDropped, stageToastText, withCommas, type HudInput } from '../../src/ui/hud/hudModel';
import {
  BOTTOM_UI_PX,
  HUD_TOP_PX,
  MAP_AREA,
  MAP_TOP_GAP_PX,
  MIN_MAP_AREA_PX,
  computeMapLayout,
  cssToGamePx,
  gameToCssPx,
  mapAreaBelowHud,
  pathCells,
  pxToTile,
  tileCenterPx,
  unitsToPx,
} from '../../src/view/layout';
import { buildSimMap, positionAt, tileCenter } from '../../src/sim/map';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/view/config';
import type { Match } from '../../src/sim/match';
import { campaign, data, infinite, jumpToStage } from '../helpers/match';

const cfg = data.game.hud;

function inputOf(match: Match, speed = 1): HudInput {
  return { state: match.state, ticksLeft: match.ticksToNextStage(), mobCount: match.mobCount(), tick: match.tick, speed };
}

describe('HUD 글자 형식', () => {
  it('타이머 m:ss, 남은 틱은 올림 (0.05초 남아도 0:01)', () => {
    expect(formatTimer(1200)).toBe('1:00');
    expect(formatTimer(1199)).toBe('1:00');
    expect(formatTimer(1180)).toBe('0:59');
    expect(formatTimer(21)).toBe('0:02');
    expect(formatTimer(1)).toBe('0:01');
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(-40)).toBe('0:00');
    expect(formatTimer(2400 * 3)).toBe('6:00');
  });

  it('돈: 1,240원 / 1만 이상 축약 1.2만원 / 1억 이상 3.4억원 (내림)', () => {
    expect(formatGold(0)).toBe('0원');
    expect(formatGold(1000)).toBe('1,000원');
    expect(formatGold(9999)).toBe('9,999원');
    expect(formatGold(10000)).toBe('1만원');
    expect(formatGold(12345)).toBe('1.2만원');
    expect(formatGold(19999)).toBe('1.9만원');
    expect(formatGold(123456)).toBe('12.3만원');
    expect(formatGold(99_999_999)).toBe('9999.9만원');
    expect(formatGold(100_000_000)).toBe('1억원');
    expect(formatGold(345_000_000)).toBe('3.4억원');
    expect(withCommas(1234567)).toBe('1,234,567');
    expect(withCommas(-1234)).toBe('-1,234');
    expect(withCommas(12)).toBe('12');
  });

  it('단계 이름: 무한 "5단계" / 캠페인 "2-32", 0단계는 준비', () => {
    expect(formatStage({ mode: 'infinite', theme: 0, stage: 0 })).toBe('준비');
    expect(formatStage({ mode: 'infinite', theme: 0, stage: 87 })).toBe('87단계');
    expect(formatStage({ mode: 'campaign', theme: 1, stage: 0 })).toBe('1-준비');
    expect(formatStage({ mode: 'campaign', theme: 2, stage: 32 })).toBe('2-32');
  });
});

describe('HUD 값 = sim 값', () => {
  it('무한 모드 시작: 준비 · 1:00 · 0/150 · 1,000원 · ×1', () => {
    const m = buildHudModel(inputOf(infinite(1)), cfg);
    expect(m).toMatchObject({ stage: '준비', boss: false, timer: '1:00', countKind: 'mobs', count: '0/150', gold: '1,000원', speed: '×1', bossBanner: null, tick: 0 });
  });

  it('무한 모드 2300틱: 1단계, 몹 수·남은 시간이 sim과 같다', () => {
    const match = infinite(2);
    match.stepN(2300);
    const m = buildHudModel(inputOf(match, 2), cfg);
    expect(m.stage).toBe('1단계');
    expect(m.count).toBe(`${match.mobCount()}/${match.state.mobLimit}`);
    expect(m.count).toBe('20/150');
    expect(m.timer).toBe(formatTimer(match.ticksToNextStage()));
    expect(m.timer).toBe('0:05'); // 다음 단계 2400까지 100틱 = 5초
    expect(m.timerWarn).toBe(true);
    expect(m.tick).toBe(2300);
    expect(m.speed).toBe('×2');
  });

  it('경고: 남은 10초 이하 노란색, 몹 120 이상 빨간색, 목숨 5 이하 빨간색', () => {
    const match = infinite(3);
    const base = inputOf(match);
    expect(buildHudModel({ ...base, ticksLeft: 201 }, cfg).timerWarn).toBe(false); // 11초
    expect(buildHudModel({ ...base, ticksLeft: 200 }, cfg).timerWarn).toBe(true); // 10초
    expect(buildHudModel({ ...base, mobCount: 119 }, cfg).countWarn).toBe(false);
    expect(buildHudModel({ ...base, mobCount: 120 }, cfg).countWarn).toBe(true);
    const camp = campaign(1);
    expect(buildHudModel(inputOf(camp), cfg)).toMatchObject({ countKind: 'lives', count: '20', countWarn: false, stage: '1-준비' });
    camp.state.lives = 6;
    expect(buildHudModel(inputOf(camp), cfg).countWarn).toBe(false);
    camp.state.lives = 5;
    expect(buildHudModel(inputOf(camp), cfg)).toMatchObject({ count: '5', countWarn: true });
  });

  it('경고 연출 (UI.md 4.2, 검토 반영): 몹 120 이상 = 빨강 + 깜빡 + 가장자리 테두리 / 목숨 5 이하 = 빨강만', () => {
    const base = inputOf(infinite(3));
    expect(buildHudModel({ ...base, mobCount: 119 }, cfg)).toMatchObject({ countWarn: false, countBlink: false, edgeWarn: false });
    expect(buildHudModel({ ...base, mobCount: 120 }, cfg)).toMatchObject({ countWarn: true, countBlink: true, edgeWarn: true });
    expect(buildHudModel({ ...base, mobCount: 151 }, cfg)).toMatchObject({ countWarn: true, countBlink: true, edgeWarn: true });
    const camp = campaign(1);
    camp.state.lives = 5;
    // 캠페인은 몹이 많아도 몹 수 경고가 아니다 (목숨으로 판정)
    expect(buildHudModel({ ...inputOf(camp), mobCount: 140 }, cfg)).toMatchObject({ countWarn: true, countBlink: false, edgeWarn: false });
    camp.state.lives = 6;
    expect(buildHudModel({ ...inputOf(camp), mobCount: 140 }, cfg)).toMatchObject({ countWarn: false, countBlink: false, edgeWarn: false });
  });

  it('하트 깨짐: 목숨이 줄었을 때만 (늘거나 같거나, 무한 모드·처음 그릴 때는 아님)', () => {
    const lives = (n: number) => ({ countKind: 'lives' as const, count: String(n) });
    expect(livesDropped(lives(20), lives(19))).toBe(true);
    expect(livesDropped(lives(3), lives(1))).toBe(true);
    expect(livesDropped(lives(19), lives(19))).toBe(false);
    expect(livesDropped(lives(5), lives(6))).toBe(false);
    expect(livesDropped({}, lives(20))).toBe(false);
    expect(livesDropped({ countKind: 'mobs', count: '30/150' }, lives(20))).toBe(false);
    expect(livesDropped({ countKind: 'mobs', count: '30/150' }, { countKind: 'mobs', count: '29/150' })).toBe(false);
    // sim에서 몹이 출구에 닿은 틱 앞뒤 모델
    const camp = campaign(1);
    const before = buildHudModel(inputOf(camp), cfg);
    camp.state.lives -= 1;
    expect(livesDropped(before, buildHudModel(inputOf(camp), cfg))).toBe(true);
  });

  it('보스와 도전 보스가 겹치면 판 보스 막대에는 판 보스 체력만 (도전 보스·쌍둥이 박쥐 체력은 빼고) — M5 검토 반영', () => {
    const match = infinite(4);
    jumpToStage(match, 10);
    const legions = { gale: '질풍 군단' };
    const queen = match.mobs().find((x) => x.boss)!;
    queen.hp = 4781; // 최대 체력의 약 25%
    for (const lv of [3, 4]) {
      match.state.challengeOpen = lv;
      match.state.challengeReady = match.state.challengeReady.map(() => 0);
      match.world.enqueue({ type: 'startChallenge', lv, player: 0 });
      match.step();
      expect(match.mobs().filter((x) => x.challenge === lv).length).toBeGreaterThan(0);
      const boss = bossHudInput(match.rules, legions, match.state, match.mobs(), match.tick);
      expect(boss?.hp).toBe(queen.hp);
      expect(buildHudModel({ ...inputOf(match), boss }, cfg).bossHp).toBe(Math.ceil((queen.hp * 1000) / match.state.bossMaxHp));
      // 다음 단계 도전을 위해 지금 도전을 끝낸다
      for (const x of match.mobs()) if (x.challenge) match.world.entities.remove(x.id);
      match.state.challengeLevel = 0;
    }
  });

  it('보스 단계: 👑 표시 + 보스 막대 (군단·계급 이름표 「이름」, 체력 천분율, 남은 초 — 10초 이하 경고)', () => {
    const match = infinite(4);
    jumpToStage(match, 10);
    const legions = { gale: '질풍 군단', earth: '대지 군단', plague: '역병 군단', shadow: '그림자 군단', lord: '군주 직속' };
    const rules = match.rules;
    const withBoss = (): HudInput => ({ ...inputOf(match), boss: bossHudInput(rules, legions, match.state, match.mobs(), match.tick) });
    const m = buildHudModel(withBoss(), cfg);
    expect(m.boss).toBe(true);
    expect(m.bossBanner).toBe('질풍 군단 · 대장 「박쥐 여왕」');
    expect(m.bossHp).toBe(1000);
    expect(m.bossTime).toBe('60초');
    const queen = match.mobs().find((x) => x.boss)!;
    queen.hp = Math.floor(queen.maxHp / 4);
    match.stepN(1200 - 200);
    const late = buildHudModel(withBoss(), cfg);
    expect(late.bossHp).toBe(250);
    expect(late.bossTime).toBe('10초');
    expect(late.bossTimeWarn).toBe(true);
    // 잡은 뒤 남은 보스 단계는 '처치!' (막대 없음)
    for (const x of match.mobs()) if (x.boss) match.world.entities.remove(x.id);
    match.state.bossId = '';
    expect(buildHudModel(withBoss(), cfg)).toMatchObject({ bossBanner: '👑 보스 처치! 남은 시간은 휴식', bossHp: -1, bossTime: '' });
    // 군주 직속은 계급 이름에 이미 들어 있다
    const d = infinite(4);
    jumpToStage(d, 60);
    expect(buildHudModel({ ...inputOf(d), boss: bossHudInput(rules, legions, d.state, d.mobs(), d.tick) }, cfg).bossBanner).toBe('군주 직속 대장 「혼돈의 용」');
    const camp = campaign(1);
    jumpToStage(camp, 11);
    expect(buildHudModel(inputOf(camp), cfg).bossBanner).toBeNull();
  });

  it('일꾼: 2줄 "3/10" (최대면 금색) + 고용 버튼 글자·살 수 있는지', () => {
    const match = infinite(4);
    const hud = () => buildHudModel({ ...inputOf(match), workerMax: 10, workerCost: 300 }, cfg);
    expect(hud()).toMatchObject({ workers: '0/10', workersFull: false, hireLabel: '👷 300원', hireReady: true });
    match.state.gold = 299;
    expect(hud().hireReady).toBe(false);
    match.state.workers = 10;
    match.state.gold = 5000;
    expect(hud()).toMatchObject({ workers: '10/10', workersFull: true, hireLabel: '👷 최대', hireReady: false });
  });

  it('패배 글자·단계 알림 글자', () => {
    expect(defeatText({ mode: 'infinite', theme: 0, stage: 8, defeatReason: 'mobLimit', mobLimit: 150 })).toEqual({
      reason: '8단계에서 몹이 150마리를 넘었어요',
      record: '8단계까지 버텼어요',
    });
    expect(defeatText({ mode: 'campaign', theme: 1, stage: 2, defeatReason: 'lives', mobLimit: 0 }).reason).toBe('1-2에서 목숨을 모두 잃었어요');
    expect(stageToastText({ mode: 'infinite', theme: 0, stage: 3, bossStage: false })).toBe('3단계 시작!');
    expect(stageToastText({ mode: 'campaign', theme: 1, stage: 10, bossStage: true })).toBe('👑 1-10 보스 단계!');
  });
});

describe('맵 화면 배치 (MAPS.md 0장: HUD와 아래 띠 사이에 가장 크게)', () => {
  const circle = data.maps.circle!;
  const crossroads = data.maps.crossroads!;

  it('순환의 정원 7×11: HUD와 아래 메뉴 사이 영역에 꽉 차고 가로 가운데', () => {
    const L = computeMapLayout(circle);
    expect(L.tile).toBe(109);
    expect([L.cols, L.rows, L.minCol, L.minRow]).toEqual([7, 11, 0, 0]);
    const left = L.originX;
    const right = L.originX + 7 * L.tile;
    expect(Math.abs(left - (GAME_WIDTH - right))).toBeLessThanOrEqual(1);
    expect(L.originY).toBeGreaterThanOrEqual(MAP_AREA.y);
    expect(L.originY + 11 * L.tile).toBeLessThanOrEqual(MAP_AREA.y + MAP_AREA.h);
  });

  it('사거리 미로 10×10 + 화면 밖 등장·퇴장 줄(y = −1): 1칸 = 102px = 화면 폭 / 10.5 (예전 13×13은 80px)', () => {
    const L = computeMapLayout(crossroads);
    expect([L.cols, L.rows, L.minRow]).toEqual([10, 11, -1]);
    expect(L.tile).toBe(102);
    expect(L.tile).toBe(Math.floor(GAME_WIDTH / 10.5));
    const spawn = tileCenterPx(L, 0, -1);
    expect(spawn.y - L.tile / 2).toBeGreaterThanOrEqual(MAP_AREA.y);
  });

  it('sim 좌표 → 픽셀: 칸 중심이 화면 칸 중심, 픽셀 → 칸은 되돌리기', () => {
    const L = computeMapLayout(circle);
    const c = tileCenter(3, 4);
    expect(unitsToPx(L, c.x, c.y)).toEqual(tileCenterPx(L, 3, 4));
    const px = tileCenterPx(L, 5, 9);
    expect(pxToTile(L, px.x, px.y)).toEqual({ tx: 5, ty: 9 });
    expect(pxToTile(L, L.originX - 1, L.originY)).toEqual({ tx: -1, ty: 0 });
    // 몹 위치(진행도) → 픽셀이 경로 칸 안
    const map = buildSimMap(circle);
    const p = positionAt(map.path, 7000);
    const t = pxToTile(L, unitsToPx(L, p.x, p.y).x, unitsToPx(L, p.x, p.y).y);
    expect(t).toEqual({ tx: 6, ty: 3 });
  });

  it('맵 영역 = 실제 HUD 아래 (검토 반영: 보스 막대·44px 버튼 때문에 커진 HUD가 맵 윗줄을 덮지 않게)', () => {
    // 측정 전(0·NaN)이나 HUD가 작으면 최소 HUD_TOP_PX
    expect(mapAreaBelowHud(0)).toEqual(MAP_AREA);
    expect(mapAreaBelowHud(Number.NaN)).toEqual(MAP_AREA);
    expect(mapAreaBelowHud(200).y).toBe(HUD_TOP_PX);
    // 412×915: HUD 2줄 + 보스 막대 자리 ≈ 383 기준 px → 맵은 그 아래 + 여백
    const area = mapAreaBelowHud(382.4);
    expect(area.y).toBe(383 + MAP_TOP_GAP_PX);
    expect(area.y + area.h).toBe(GAME_HEIGHT - BOTTOM_UI_PX);
    expect(area.w).toBe(GAME_WIDTH);
    const L = computeMapLayout(circle, area);
    expect(L.originY + L.minRow * L.tile).toBeGreaterThanOrEqual(383);
    expect(L.originY + (L.minRow + L.rows) * L.tile).toBeLessThanOrEqual(GAME_HEIGHT - BOTTOM_UI_PX);
    // 가로 화면처럼 HUD가 아주 커도 맵 영역은 최소 높이를 지킨다
    const flat = mapAreaBelowHud(5000);
    expect(flat.h).toBe(MIN_MAP_AREA_PX);
    expect(computeMapLayout(circle, flat).tile).toBeGreaterThan(40);
  });

  it('CSS px ↔ 기준 px (무대 너비 기준), 무대 너비 0이면 0', () => {
    expect(cssToGamePx(146, 412)).toBeCloseTo(382.7, 1);
    expect(cssToGamePx(100, 360)).toBe(300);
    expect(cssToGamePx(100, 0)).toBe(0);
    expect(gameToCssPx(cssToGamePx(123, 412), 412)).toBeCloseTo(123, 9);
  });

  it('경로 칸 목록: 순환 24칸, 사거리 미로는 맵 안 54칸 + 화면 밖 2칸', () => {
    expect(pathCells(buildSimMap(circle))).toHaveLength(24);
    const cells = pathCells(buildSimMap(crossroads));
    expect(cells).toHaveLength(56);
    expect(cells[0]).toMatchObject({ x: 0, y: -1, dx: 0, dy: 1 });
    expect(cells.at(-1)).toMatchObject({ x: 3, y: -1 });
  });
});
