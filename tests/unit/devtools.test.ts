/**
 * T-1 개발자 도구: 개발자 모드 판단, 개발자 배속(×16) 목록, TickClock ×16, 프레임 틱 상한, ⏭ 길게 누르기 간격, 그림 주소 표.
 */
import { describe, expect, it } from 'vitest';
import { isDevMode } from '../../src/devMode';
import { readUrlOptions } from '../../src/view/context';
import { availableSpeeds, nextSpeed } from '../../src/ui/hud/speed';
import { DataError, buildGameData, bundledRawData, loadGameData } from '../../src/data/load';
import { TICK_MS, TickClock } from '../../src/sim/World';
import { SIM_BUDGET_MAX_MS, SIM_BUDGET_MIN_MS, TickCostMeter, capTicks, simBudgetMs } from '../../src/view/tickBudget';
import { HOLD_DELAY_MS, SKIP_REPEAT_MS, holdRepeatDelay, skipRepeatDelay } from '../../src/ui/hold';
import { assetKey, embeddedAssetJson, resolveAssetUrl } from '../../src/assets';
import { FX_BUDGET_NORMAL, fxBudget } from '../../src/view/render/fxModel';

describe('개발자 모드 (src/devMode.ts)', () => {
  it('?debug=1 또는 ?dev=1이면 켜짐, 다른 값·없으면 꺼짐', () => {
    expect(isDevMode('?debug=1')).toBe(true);
    expect(isDevMode('?dev=1')).toBe(true);
    expect(isDevMode('?seed=3&dev=1')).toBe(true);
    expect(isDevMode('')).toBe(false);
    expect(isDevMode('?seed=3')).toBe(false);
    expect(isDevMode('?dev=0')).toBe(false);
    expect(isDevMode('?dev=true')).toBe(false);
    expect(isDevMode('?debug=true')).toBe(false);
  });

  it("테스트 빌드(VITE_TEST_BUILD='1')면 주소 옵션 없이도 켜짐", () => {
    expect(isDevMode('', '1')).toBe(true);
    expect(isDevMode('', true)).toBe(true);
    expect(isDevMode('', undefined)).toBe(false);
    expect(isDevMode('', '0')).toBe(false);
    expect(isDevMode('', '')).toBe(false);
  });

  it('readUrlOptions.debug가 개발자 모드를 따른다 (예전 ?debug=1 그대로)', () => {
    expect(readUrlOptions('?dev=1&seed=5')).toEqual({ debug: true, seed: 5 });
    expect(readUrlOptions('?debug=1')).toEqual({ debug: true, seed: null });
    expect(readUrlOptions('', '1')).toEqual({ debug: true, seed: null });
    expect(readUrlOptions('?seed=5', undefined)).toEqual({ debug: false, seed: 5 });
  });
});

describe('개발자 배속 (game.json devSpeeds)', () => {
  const game = loadGameData().game;

  it('개발자 모드는 ×1 → ×2 → ×4 → ×8 → ×16 → ×1 순환 (T-2 "배속은 2 4 8 16만": ×3 없음)', () => {
    const list = availableSpeeds(game.speeds, 1, true, game.devSpeeds);
    expect(list).toEqual([1, 2, 4, 8, 16]);
    let s = 1;
    const seen = [s];
    for (let i = 0; i < 5; i++) seen.push((s = nextSpeed(s, list)));
    expect(seen).toEqual([1, 2, 4, 8, 16, 1]);
    // 계정 Lv12라도 개발자 모드 순환에는 ×3이 끼지 않는다
    expect(availableSpeeds(game.speeds, 12, true, game.devSpeeds)).not.toContain(3);
  });

  it('일반 모드는 예전 그대로 (계정 Lv1 ×1·×2, Lv12 ×3) — devSpeeds를 넘겨도 쓰지 않는다', () => {
    expect(availableSpeeds(game.speeds, 1, false, game.devSpeeds)).toEqual([1, 2]);
    expect(availableSpeeds(game.speeds, 12, false, game.devSpeeds)).toEqual([1, 2, 3]);
  });

  it('검사: ×1부터 오름차순·최대 ×16 (T-2부터 일반 배속 ×3을 포함하지 않아도 된다)', () => {
    const bad = (devSpeeds: unknown): string[] => {
      const raw = structuredClone(bundledRawData());
      (raw.game as Record<string, unknown>).devSpeeds = devSpeeds;
      try {
        buildGameData(raw);
      } catch (e) {
        if (e instanceof DataError) return e.issues.map((i) => i.path);
        throw e;
      }
      return [];
    };
    expect(bad([1, 2, 3, 4, 8, 16])).toEqual([]);
    expect(bad([2, 4])).toContain('devSpeeds[0]');
    expect(bad([1, 4, 3])).toContain('devSpeeds[2]');
    expect(bad([1, 2, 3, 32])).toContain('devSpeeds[3]');
    expect(bad([1, 2, 4, 8, 16])).toEqual([]);
    expect(bad([])).toContain('devSpeeds');
  });
});

describe('TickClock ×16 (프레임 자르기는 배속을 곱하기 전 실제 시간에)', () => {
  const run = (clock: TickClock, frames: number, frameMs: number): number => {
    let n = 0;
    for (let i = 0; i < frames; i++) n += clock.advance(frameMs);
    return n;
  };

  it('60fps 1초 = 320틱, 10fps 5초 = 1600틱 (20틱/초 × 16 × 5)', () => {
    expect(run(new TickClock({ speed: 16 }), 60, 1000 / 60)).toBe(320);
    expect(run(new TickClock({ speed: 16 }), 50, 100)).toBe(1600);
  });

  it('한 프레임이 길면 실제 시간 250ms까지만 → ×16이면 게임 시간 4초 = 80틱 (×16만큼 더 줄이지 않는다)', () => {
    const c = new TickClock({ speed: 16, maxFrameMs: 250 });
    expect(c.advance(10_000)).toBe((250 * 16) / TICK_MS);
    expect(new TickClock({ speed: 8, maxFrameMs: 250 }).advance(250)).toBe(40);
  });

  it('×4·×8도 정확히 배수', () => {
    expect(run(new TickClock({ speed: 4 }), 60, 1000 / 60)).toBe(80);
    expect(run(new TickClock({ speed: 8 }), 60, 1000 / 60)).toBe(160);
  });
});

describe('프레임 틱 상한 (src/view/tickBudget.ts)', () => {
  it('예산 = 프레임 시간의 절반, 12~50ms', () => {
    expect(simBudgetMs(1000 / 60)).toBe(SIM_BUDGET_MIN_MS);
    expect(simBudgetMs(60)).toBe(30);
    expect(simBudgetMs(1000)).toBe(SIM_BUDGET_MAX_MS);
    expect(simBudgetMs(Number.NaN)).toBe(SIM_BUDGET_MIN_MS);
  });

  it('틱 비용을 모르거나 싸면 그대로, 비싸면 예산만큼 — ×1 몫(요청 ÷ 배속)은 줄이지 않는다', () => {
    expect(capTicks(32, 16, 0, 50)).toBe(32); // 아직 모름
    expect(capTicks(32, 16, 0.5, 50)).toBe(32); // 100틱까지 됨
    expect(capTicks(80, 16, 2, 50)).toBe(25); // 50 / 2
    expect(capTicks(80, 16, 40, 50)).toBe(5); // 예산은 1틱이지만 ×1 몫 ⌈80/16⌉ = 5
    expect(capTicks(5, 1, 100, 12)).toBe(5); // ×1은 절대 줄이지 않음
    expect(capTicks(1, 16, 100, 12)).toBe(1);
    expect(capTicks(0, 16, 1, 12)).toBe(0);
  });

  it('측정기: 지수 이동 평균, 0틱은 무시', () => {
    const m = new TickCostMeter();
    expect(m.avgMs).toBe(0);
    m.record(10, 10);
    expect(m.avgMs).toBe(1);
    m.record(10, 60); // 6ms/틱
    expect(m.avgMs).toBeCloseTo(0.8 * 1 + 0.2 * 6);
    m.record(0, 100);
    expect(m.avgMs).toBeCloseTo(2);
    m.dropped = 3;
    m.reset();
    expect(m.avgMs).toBe(0);
    expect(m.dropped).toBe(0);
  });
});

describe('⏭ 길게 누르기 간격', () => {
  it('처음 0.38초 뒤 초당 4번으로 일정 (강화 버튼처럼 빨라지지 않는다)', () => {
    expect(skipRepeatDelay(0)).toBe(HOLD_DELAY_MS);
    expect(SKIP_REPEAT_MS).toBe(250);
    for (let n = 1; n < 20; n++) expect(skipRepeatDelay(n)).toBe(250);
    // 강화 버튼 간격은 그대로
    expect(holdRepeatDelay(1)).toBe(160);
  });
});

describe('그림 주소 표 (src/assets.ts, 한 파일 빌드의 window.__RTD_ASSETS__)', () => {
  const table = { 'assets/characters/miner.webp': 'data:image/webp;base64,AAAA', 'assets/meta.json': { a: 1 } };
  it('표에 있으면 data URI, 없으면 상대 주소', () => {
    expect(assetKey('./assets/x.png')).toBe('assets/x.png');
    expect(assetKey('/assets/x.png')).toBe('assets/x.png');
    expect(resolveAssetUrl('assets/characters/miner.webp', table)).toBe('data:image/webp;base64,AAAA');
    expect(resolveAssetUrl('./assets/characters/miner.webp', table)).toBe('data:image/webp;base64,AAAA');
    expect(resolveAssetUrl('assets/none.png', table)).toBe('./assets/none.png');
    expect(resolveAssetUrl('assets/none.png', null)).toBe('./assets/none.png');
  });
  it('JSON은 객체 그대로', () => {
    expect(embeddedAssetJson('assets/meta.json', table)).toEqual({ a: 1 });
    expect(embeddedAssetJson('assets/characters/miner.webp', table)).toBeUndefined();
    expect(embeddedAssetJson('assets/meta.json', null)).toBeUndefined();
  });
});

describe('배속별 연출 한도 (fxModel.fxBudget, 화면 전용)', () => {
  it('×3까지는 예전 값 그대로 (일반 모드 화면이 바뀌지 않는다)', () => {
    for (const sp of [0, 1, 2, 3]) expect(fxBudget(sp)).toBe(FX_BUDGET_NORMAL);
    expect(FX_BUDGET_NORMAL).toMatchObject({ damageTexts: 16, forceCrit: true, activeTexts: 48, sparks: 12, areaFx: 8 });
    expect(FX_BUDGET_NORMAL.coins).toBe(Number.POSITIVE_INFINITY);
  });
  it('×4·×8·×16은 점점 줄이고 큰 피해부터 고른다 (치명타 강제 없음)', () => {
    const [a, b, c] = [fxBudget(4), fxBudget(8), fxBudget(16)];
    for (const x of [a, b, c]) expect(x.forceCrit).toBe(false);
    expect([a.damageTexts, b.damageTexts, c.damageTexts]).toEqual([4, 3, 2]);
    expect([a.activeTexts, b.activeTexts, c.activeTexts]).toEqual([24, 16, 12]);
    expect(a.coins).toBeGreaterThan(c.coins);
    expect(a.sparks).toBeGreaterThan(c.sparks);
  });
});
