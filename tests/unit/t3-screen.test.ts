/**
 * T-3 화면 꽉 차게 · 타일 숨김 · 작은 맵 보정: 무대 맞추기(fitStage), 가변 높이 맵 영역, 배치 칸 잠깐 보이기, 공격력 기본 보정.
 */
import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_MAX_HEIGHT, GAME_MIN_HEIGHT, GAME_WIDTH } from '../../src/view/config';
import { fitStage, logicalHeight } from '../../src/view/viewport';
import { BOTTOM_UI_PX, computeMapLayout, cssToGamePx, mapAreaBelowHud } from '../../src/view/layout';
import { BUILD_HINT_FADE_MS, BUILD_HINT_MS, buildHintAlpha } from '../../src/view/render/buildHint';
import { buildMatchRules } from '../../src/sim/rules';
import { effectiveStats } from '../../src/sim/stats';
import { data } from '../helpers/match';

describe('무대 맞추기 (viewport.ts fitStage)', () => {
  const phones: [number, number, number][] = [
    // [CSS 너비, 높이, 논리 높이]
    [412, 915, 2399],
    [360, 800, 2400],
    [390, 844, 2337],
    [412, 732, 1920],
  ];
  for (const [w, h, gameH] of phones) {
    it(`${w}×${h}: 논리 1080×${gameH}, 무대가 화면 전체 (빈 띠 0)`, () => {
      const f = fitStage(w, h);
      expect(f.gameW).toBe(GAME_WIDTH);
      expect(f.gameH).toBe(gameH);
      expect([f.cssW, f.cssH, f.left, f.top]).toEqual([w, h, 0, 0]);
      expect(f.full).toBe(true);
      // 캔버스(같은 비율)와 무대의 차이는 1px 미만
      expect(Math.abs((f.cssW / f.gameW) * f.gameH - f.cssH)).toBeLessThan(1);
    });
  }

  it('9:16보다 넓은 화면(768×1024 태블릿): 1080×1920을 가운데에, 양옆 띠 (배경 그림으로 채움)', () => {
    const f = fitStage(768, 1024);
    expect(f.gameH).toBe(GAME_MIN_HEIGHT);
    expect(f.cssH).toBe(1024);
    expect(f.cssW).toBeCloseTo(576, 6);
    expect(f.left).toBeCloseTo(96, 6);
    expect(f.top).toBe(0);
    expect(f.full).toBe(false);
  });

  it('2600보다 길쭉한 화면: 논리 높이는 2600에서 멈추고 위아래 띠', () => {
    const f = fitStage(300, 900);
    expect(logicalHeight(300, 900)).toBe(GAME_MAX_HEIGHT);
    expect(f.cssW).toBe(300);
    expect(f.cssH).toBeCloseTo((300 * GAME_MAX_HEIGHT) / GAME_WIDTH, 6);
    expect(f.top).toBeGreaterThan(0);
    expect(f.full).toBe(false);
  });

  it('크기를 모르면(0) 기준 1920, 무대 0', () => {
    expect(logicalHeight(0, 915)).toBe(GAME_HEIGHT);
    expect(fitStage(0, 0)).toMatchObject({ gameH: GAME_HEIGHT, cssW: 0, cssH: 0 });
  });
});

describe('가변 높이 맵 영역 (layout.ts mapAreaBelowHud + computeMapLayout)', () => {
  it('412×915 (논리 2399): 맵 영역 아래 끝 = 잰 아래 띠, 1920 기준보다 맵이 크다', () => {
    const gameH = fitStage(412, 915).gameH;
    // HUD 띠 + 알림 자리 ≈ 146 CSS px, 아래 띠 + 하단 메뉴 ≈ 140 CSS px (412px 무대)
    const hud = cssToGamePx(146, 412);
    const bottomTop = cssToGamePx(915 - 140, 412);
    const tall = mapAreaBelowHud(hud, bottomTop, gameH);
    expect(tall.y + tall.h).toBe(Math.floor(bottomTop));
    // 아래 띠를 못 쟀을 때도 지금 높이 기준
    expect(mapAreaBelowHud(hud, undefined, gameH).h).toBe(gameH - BOTTOM_UI_PX - Math.ceil(hud));
    const circle = data.maps.circle!;
    const old = computeMapLayout(circle, mapAreaBelowHud(hud, cssToGamePx(732 - 140, 412), GAME_HEIGHT));
    const L = computeMapLayout(circle, tall);
    expect(L.tile).toBeGreaterThan(old.tile);
    // 판(가로·세로 여백 없음 — 맵 B안 + A-1)이 영역 안, 가로 가운데
    expect(L.originY).toBeGreaterThanOrEqual(tall.y);
    expect(L.originY + L.rows * L.tile).toBeLessThanOrEqual(tall.y + tall.h);
    expect(Math.abs(L.originX - (GAME_WIDTH - (L.originX + L.cols * L.tile)))).toBeLessThanOrEqual(1);
  });

  it('여러 화면 비율에서 순환의 정원·사거리 미로 칸 크기 (가능한 가장 큰 정수 칸)', () => {
    const sizes: Record<string, number[]> = {};
    for (const [w, h] of [[412, 915], [360, 800], [390, 844], [412, 732]] as const) {
      const gameH = fitStage(w, h).gameH;
      const area = mapAreaBelowHud(cssToGamePx(146, w), cssToGamePx(h - 140, w), gameH);
      for (const id of ['circle', 'crossroads'] as const) {
        const L = computeMapLayout(data.maps[id]!, area);
        (sizes[id] ??= []).push(L.tile);
        expect(L.tile).toBe(Math.floor(Math.min(area.w / L.cols, area.h / L.rows)));
        // 세로도 영역 안 (여백 없이 꽉 찰 수 있음)
        expect(L.originY + L.minRow * L.tile).toBeGreaterThanOrEqual(area.y);
        expect(L.originY + (L.minRow + L.rows) * L.tile).toBeLessThanOrEqual(area.y + area.h);
        // 가로는 영역 안 (여백 없이 꽉 찰 수 있음), 가운데
        expect(L.originX + L.minCol * L.tile).toBeGreaterThanOrEqual(area.x);
        expect(L.originX + (L.minCol + L.cols) * L.tile).toBeLessThanOrEqual(area.x + area.w);
      }
    }
    // 9:16보다 길쭉한 휴대폰에서 사거리 미로(10칸)는 가로가 여백 없이 꽉 찬다 (맵 B안: 1080 / 10 = 108, 예전 반 칸 여백 102), 9:16(412×732)은 세로가 먼저 참
    expect(sizes.crossroads!.slice(0, 3)).toEqual([108, 108, 108]);
    expect(sizes.crossroads![3]).toBeGreaterThanOrEqual(95);
    // 순환의 정원(7×11)은 길쭉할수록 칸이 커진다 (예전 9×11·1920 고정에서는 1칸 약 109px)
    expect(sizes.circle![0]).toBeGreaterThan(sizes.circle![3]!);
    expect(Math.min(...sizes.circle!)).toBeGreaterThanOrEqual(95);
  });
});

describe('배치 칸 잠깐 보이기 (buildHint.ts, T-3 타일 숨김)', () => {
  it('끄는 중이면 1, 평소 0, 누른 뒤 BUILD_HINT_MS 동안 보였다가 끝에 서서히', () => {
    expect(buildHintAlpha(true, 5000, null)).toBe(1);
    expect(buildHintAlpha(false, 5000, null)).toBe(0);
    expect(buildHintAlpha(false, 1000, 1000)).toBe(1);
    expect(buildHintAlpha(false, 1000 + BUILD_HINT_MS - BUILD_HINT_FADE_MS, 1000)).toBe(1);
    expect(buildHintAlpha(false, 1000 + BUILD_HINT_MS - BUILD_HINT_FADE_MS / 2, 1000)).toBeCloseTo(0.5, 6);
    expect(buildHintAlpha(false, 1000 + BUILD_HINT_MS, 1000)).toBe(0);
    expect(buildHintAlpha(false, 900, 1000)).toBe(0);
    // 연출 끄기: 서서히 사라지지 않고 바로 꺼짐 (보이는 동안은 같음)
    expect(buildHintAlpha(false, 1000 + BUILD_HINT_MS - BUILD_HINT_FADE_MS, 1000, true)).toBe(1);
    expect(buildHintAlpha(false, 1000 + BUILD_HINT_MS - BUILD_HINT_FADE_MS / 2, 1000, true)).toBe(0);
    expect(buildHintAlpha(true, 5000, null, true)).toBe(1);
  });
});

describe('모든 타워 공격력 기본 보정 (game.json combat.towerAtkPct, T-3 작은 맵 보정 손잡이)', () => {
  it('지금 값은 0 (봇 확인 결과 보정 없음 — docs/BALANCE.md T-3), 값을 넣으면 공격력% 합에 더한다', () => {
    expect(data.game.combat.towerAtkPct).toBe(0);
    const rules = buildMatchRules(data);
    const archer = rules.towers.get('archer')!;
    expect(effectiveStats(rules, archer).atkMulBp).toBe(10_000);
    const boosted = buildMatchRules({ ...data, game: { ...data.game, combat: { ...data.game.combat, towerAtkPct: 0.25 } } });
    expect(boosted.towerAtkPctBp).toBe(2500);
    expect(effectiveStats(boosted, archer).atkMulBp).toBe(12_500);
    expect(effectiveStats(boosted, archer, { ...newModsWith(1000) }).atkMulBp).toBe(13_500);
  });
});

function newModsWith(atkPctBp: number) {
  return { atkPctBp, apsPctBp: 0, armorPenBp: 0, magicPenBp: 0, flatArmorPen: 0, flatMagicPen: 0, critChanceBp: 0, critMulBp: 0, bossDmgPctBp: 0, rangePctBp: 0 };
}
