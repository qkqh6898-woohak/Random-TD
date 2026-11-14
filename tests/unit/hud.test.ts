/**
 * M1-8 HUD 표시값 (값이 sim과 일치) + M1-7 맵 화면 배치 (순수 함수, DOM·Phaser 없음).
 */
import { describe, expect, it } from 'vitest';
import { buildHudModel, defeatText, formatGold, formatStage, formatTimer, stageToastText, withCommas, type HudInput } from '../../src/ui/hud/hudModel';
import { computeMapLayout, MAP_AREA, pathCells, pxToTile, tileCenterPx, unitsToPx } from '../../src/view/layout';
import { buildSimMap, positionAt, tileCenter } from '../../src/sim/map';
import { GAME_WIDTH } from '../../src/view/config';
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

  it('보스 단계: 👑 표시 + 배너 (캠페인은 보스 배치표 이름)', () => {
    const match = infinite(4);
    jumpToStage(match, 10);
    const m = buildHudModel(inputOf(match), cfg);
    expect(m.boss).toBe(true);
    expect(m.bossBanner).toContain('보스 단계');
    const camp = campaign(1);
    jumpToStage(camp, 10);
    const theme1 = data.campaign.themes[0]!;
    const cm = buildHudModel({ ...inputOf(camp), bossNames: theme1.bossSchedule }, cfg);
    expect(cm.stage).toBe('1-10');
    expect(cm.bossBanner).toContain(theme1.bossSchedule['10']!);
    jumpToStage(camp, 11);
    expect(buildHudModel(inputOf(camp), cfg).bossBanner).toBeNull();
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

describe('맵 화면 배치 (MAPS.md 0장: 화면 가로폭에 맞춤)', () => {
  const circle = data.maps.circle!;
  const crossroads = data.maps.crossroads!;

  it('순환의 정원 9×11: HUD와 아래 메뉴 사이 영역에 꽉 차고 가로 가운데', () => {
    const L = computeMapLayout(circle);
    expect(L.tile).toBe(109);
    expect([L.cols, L.rows, L.minCol, L.minRow]).toEqual([9, 11, 0, 0]);
    const left = L.originX;
    const right = L.originX + 9 * L.tile;
    expect(Math.abs(left - (GAME_WIDTH - right))).toBeLessThanOrEqual(1);
    expect(L.originY).toBeGreaterThanOrEqual(MAP_AREA.y);
    expect(L.originY + 11 * L.tile).toBeLessThanOrEqual(MAP_AREA.y + MAP_AREA.h);
  });

  it('사거리 미로 13×13 + 화면 밖 등장·퇴장 줄(y = −1): 1칸 = 80px = 화면 폭 / 13.5', () => {
    const L = computeMapLayout(crossroads);
    expect([L.cols, L.rows, L.minRow]).toEqual([13, 14, -1]);
    expect(L.tile).toBe(80);
    expect(L.tile).toBe(Math.floor(GAME_WIDTH / 13.5));
    const spawn = tileCenterPx(L, 0, -1);
    expect(spawn.y - L.tile / 2).toBeGreaterThanOrEqual(MAP_AREA.y);
  });

  it('sim 좌표 → 픽셀: 칸 중심이 화면 칸 중심, 픽셀 → 칸은 되돌리기', () => {
    const L = computeMapLayout(circle);
    const c = tileCenter(3, 4);
    expect(unitsToPx(L, c.x, c.y)).toEqual(tileCenterPx(L, 3, 4));
    const px = tileCenterPx(L, 6, 9);
    expect(pxToTile(L, px.x, px.y)).toEqual({ tx: 6, ty: 9 });
    expect(pxToTile(L, L.originX - 1, L.originY)).toEqual({ tx: -1, ty: 0 });
    // 몹 위치(진행도) → 픽셀이 경로 칸 안
    const map = buildSimMap(circle);
    const p = positionAt(map.path, 7000);
    const t = pxToTile(L, unitsToPx(L, p.x, p.y).x, unitsToPx(L, p.x, p.y).y);
    expect(t).toEqual({ tx: 7, ty: 2 });
  });

  it('경로 칸 목록: 순환 28칸, 사거리 미로는 맵 안 73칸 + 화면 밖 2칸', () => {
    expect(pathCells(buildSimMap(circle))).toHaveLength(28);
    const cells = pathCells(buildSimMap(crossroads));
    expect(cells).toHaveLength(75);
    expect(cells[0]).toMatchObject({ x: 0, y: -1, dx: 0, dy: 1 });
    expect(cells.at(-1)).toMatchObject({ x: 4, y: -1 });
  });
});
