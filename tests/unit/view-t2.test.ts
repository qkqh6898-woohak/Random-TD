/**
 * T-2 화면 모델 (순수): 연출 끄기 상태·화면 설정 저장, 판매 버튼 글자·확인 등급, 개발자 확률 조정 줄·다음 값, 히든 조합 목록,
 * 미션 시트 '히든 미션 조건 보기', 도박 릴(연출 끄기면 바로 멈춤)·꾹 누르기 간격·자동 소환 간격, 배속.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { effectsOff, onEffectsChange, setEffectsOff } from '../../src/view/effects';
import { DEFAULT_SETTINGS, SETTINGS_KEY, createSettingsStore, parseSettings } from '../../src/meta/settings';
import { MemoryStorage } from '../../src/save/storage';
import { buildTowerPanelModel, sellLabel, sellNeedsConfirm } from '../../src/ui/panels/towerPanelModel';
import { chanceText, devChanceModel, hiddenRecipeRows, nextChanceBp } from '../../src/ui/sheets/devModels';
import { missionSheetModel } from '../../src/ui/sheets/sheetModels';
import { SLOT_SPIN_MS, slotFrame } from '../../src/ui/sheets/slot';
import { AUTO_SUMMON_FAST_MS, AUTO_SUMMON_MS, GAMBLE_POLL_MS, HOLD_DELAY_MS, autoSummonInterval, gambleHoldDelay } from '../../src/ui/hold';
import { availableSpeeds } from '../../src/ui/hud/speed';
import { effectiveStats } from '../../src/sim/stats';
import { arena, command, data } from '../helpers/match';

afterEach(() => setEffectsOff(false));

describe('연출 끄기 상태 (src/view/effects.ts)', () => {
  it('켜고 끄면 구독자에게 한 번씩 알리고, 같은 값이면 알리지 않는다, 구독 해제', () => {
    const seen: boolean[] = [];
    const off = onEffectsChange((v) => seen.push(v));
    expect(effectsOff()).toBe(false);
    setEffectsOff(true);
    setEffectsOff(true);
    expect(effectsOff()).toBe(true);
    setEffectsOff(false);
    off();
    setEffectsOff(true);
    expect(seen).toEqual([true, false]);
  });
});

describe('화면 설정 (rtd.settings)', () => {
  it('기본: 눌러서 바로 승급 켜짐 · 연출 끄기 꺼짐 · 히든 보기 꺼짐, 망가진 값은 기본값', () => {
    expect(parseSettings(null)).toEqual({ tapMerge: true, effectsOff: false, revealHidden: false });
    expect(parseSettings('{{{')).toEqual({ ...DEFAULT_SETTINGS });
    expect(parseSettings('{"tapMerge":"no","effectsOff":true}')).toEqual({ tapMerge: true, effectsOff: true, revealHidden: false });
  });

  it('바꾸면 저장되고 다음에 읽힌다', () => {
    const st = new MemoryStorage();
    const a = createSettingsStore(st);
    a.set('tapMerge', false);
    a.set('effectsOff', true);
    expect(JSON.parse(st.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({ tapMerge: false, effectsOff: true });
    expect(createSettingsStore(st).get()).toEqual({ tapMerge: false, effectsOff: true, revealHidden: false });
  });
});

describe('타워 패널 판매 버튼', () => {
  it("글자 '💰 판매 +1,350원' / 확인 중 '한 번 더 누르면 판매', 히어로·레전드·신·히든만 두 번 누르기", () => {
    expect(sellLabel(50, false)).toBe('💰 판매 +50원');
    expect(sellLabel(1350, false)).toBe('💰 판매 +1,350원');
    expect(sellLabel(1350, true)).toBe('한 번 더 누르면 판매');
    const cg = data.game.sell.confirmGrades;
    expect(['normal', 'rare', 'unique'].map((g) => sellNeedsConfirm(g as never, cg))).toEqual([false, false, false]);
    expect(['hero', 'legend', 'god', 'hidden'].map((g) => sellNeedsConfirm(g as never, cg))).toEqual([true, true, true, true]);
  });

  it('패널 모델에 판매 글자가 들어간다', () => {
    const m = arena();
    const t = data.towers.towers.find((x) => x.grade === 'hero')!;
    const stats = m.rules.towers.get(t.id)!;
    const model = buildTowerPanelModel({
      data: t,
      stats,
      eff: effectiveStats(m.rules, stats),
      factionName: 'x',
      owned: 1,
      mergeCount: 3,
      mergeableGrade: true,
      outcomes: [],
      paused: false,
      penMaxBp: 9000,
      sell: { price: 1350, confirming: true },
    });
    expect(model.sellLabel).toBe('한 번 더 누르면 판매');
    expect(model.sellConfirming).toBe(true);
  });
});

describe('개발자 확률 조정 줄 (devModels)', () => {
  const list = data.game.devChances.list;

  it('줄 = game.json devChances 순서, 지금 값·기본값, 신 0.01%, 도박 ×5 2%, 치명타 보너스 +0%', () => {
    const m = arena(1, { debug: true });
    const model = devChanceModel(m.ctx, list);
    expect(model.rows.map((r) => r.key)).toEqual(list.map((c) => c.key));
    const row = (k: string) => model.rows.find((r) => r.key === k)!;
    expect(row('god').value).toBe('0.01%');
    expect(row('gamble:5').value).toBe('2%');
    expect(row('critBonus').value).toBe('+0%');
    expect(row('critBonus').canDown).toBe(false);
    expect(model.anyChanged).toBe(false);
    expect(model.gambleLine).toContain('×0 40%');
    expect(chanceText('summonRare', 250)).toBe('+2.5%');
  });

  it('다음 값: 0.1%p 단위 (신 0.01% → 0.1% → 0.2%, 아래로는 0), 끝에 닿으면 null', () => {
    const m = arena(1, { debug: true });
    expect(nextChanceBp(m.ctx, 'god', 1)).toBe(10);
    expect(nextChanceBp(m.ctx, 'god', -1)).toBe(0);
    command(m, { type: 'debugSetChance', key: 'god', bp: 10 });
    expect(nextChanceBp(m.ctx, 'god', 1)).toBe(20);
    command(m, { type: 'debugSetChance', key: 'god', bp: 0 });
    expect(nextChanceBp(m.ctx, 'god', -1)).toBeNull();
    command(m, { type: 'debugSetChance', key: 'god', bp: 10000 });
    expect(nextChanceBp(m.ctx, 'god', 1)).toBeNull();
    // 도박: ×0이 0%가 되면 더 못 올림
    command(m, { type: 'debugSetChance', key: 'gamble:2', bp: 10000 });
    expect(nextChanceBp(m.ctx, 'gamble:2', 1)).toBeNull();
    const model = devChanceModel(m.ctx, list);
    expect(model.rows.find((r) => r.key === 'gamble:2')!.canUp).toBe(false);
    expect(model.rows.find((r) => r.key === 'gamble:2')!.changed).toBe(true);
    expect(model.gambleLine).toContain('×0 0%');
    expect(model.anyChanged).toBe(true);
  });

  it('도박 확률을 올리면 기대값 줄이 바뀐다', () => {
    const m = arena(1, { debug: true });
    const before = devChanceModel(m.ctx, list).gambleLine;
    command(m, { type: 'debugSetChance', key: 'gamble:5', bp: 1000 });
    expect(devChanceModel(m.ctx, list).gambleLine).not.toBe(before);
  });
});

describe('히든 조합 목록', () => {
  it('12종, 재료 3개, 판 위 ✓·덱 표시, 모두 판 위면 ready', () => {
    const m = arena();
    const towers = data.towers.towers;
    const rows = hiddenRecipeRows(towers, new Set(), m.rules.baseDeck);
    expect(rows).toHaveLength(12);
    for (const r of rows) expect(r.materials.length).toBeGreaterThanOrEqual(2);
    const first = rows[0]!;
    const owned = new Set(first.materials.map((x) => x.id));
    const again = hiddenRecipeRows(towers, owned, m.rules.baseDeck)[0]!;
    expect(again.materials.every((x) => x.onBoard)).toBe(true);
    expect(again.ready).toBe(true);
    const deckIds = new Set([...m.rules.baseDeck.normal, ...m.rules.baseDeck.rare, ...m.rules.baseDeck.unique, ...m.rules.baseDeck.hero, ...m.rules.baseDeck.legend]);
    for (const r of rows) for (const x of r.materials) expect(x.inDeck).toBe(deckIds.has(x.id));
  });
});

describe("미션 시트 '히든 미션 조건 보기'", () => {
  it('끄면 ???, 켜면 히든 이름·보상이 보인다', () => {
    const m = arena();
    const hiddenRows = (all: boolean) => missionSheetModel(m.ctx, m.world, new Set(), all).hidden;
    expect(hiddenRows(false).every((r) => r.name === '???')).toBe(true);
    const shown = hiddenRows(true);
    expect(shown.every((r) => r.name !== '???' && r.revealed)).toBe(true);
    expect(shown.every((r) => r.reward.startsWith('+'))).toBe(true);
  });
});

describe('도박 릴·꾹 누르기·자동 소환 간격', () => {
  it('릴은 1초 돌고 멈춘다, 연출 끄기(spinMs 0)면 결과가 오는 대로 바로', () => {
    const result = { mul: '×2', mulBp: 20000, win: 20, cost: 10, jackpot: false };
    expect(slotFrame({ startMs: 0, result, revealedMs: null }, SLOT_SPIN_MS - 1, ['×0', '×2']).spinning).toBe(true);
    expect(slotFrame({ startMs: 0, result, revealedMs: null }, SLOT_SPIN_MS, ['×0', '×2'])).toMatchObject({ spinning: false, reel: '×2', justRevealed: true });
    expect(slotFrame({ startMs: 0, result, revealedMs: null, spinMs: 0 }, 1, ['×0', '×2'])).toMatchObject({ spinning: false, reel: '×2' });
    expect(slotFrame({ startMs: 0, result: null, revealedMs: null, spinMs: 0 }, 500, ['×0', '×2']).spinning).toBe(true);
  });

  it('도박 꾹 누르기: 처음 0.38초 뒤부터 짧게 다시 묻는다 (릴이 멈출 때까지 Game이 기다림)', () => {
    expect(gambleHoldDelay(0)).toBe(HOLD_DELAY_MS);
    expect(gambleHoldDelay(1)).toBe(GAMBLE_POLL_MS);
    expect(gambleHoldDelay(20)).toBe(GAMBLE_POLL_MS);
  });

  it('자동 소환: 초당 약 4번, 연출 끄기면 더 빠르게', () => {
    expect(autoSummonInterval(false)).toBe(AUTO_SUMMON_MS);
    expect(autoSummonInterval(true)).toBe(AUTO_SUMMON_FAST_MS);
    expect(1000 / AUTO_SUMMON_MS).toBe(4);
    expect(AUTO_SUMMON_FAST_MS).toBeLessThan(AUTO_SUMMON_MS);
  });

  it('배속: 개발자 ×1·×2·×4·×8·×16, 일반도 Lv1부터 전부', () => {
    expect(availableSpeeds(data.game.speeds, 1, true, data.game.devSpeeds)).toEqual([1, 2, 4, 8, 16]);
    expect(availableSpeeds(data.game.speeds, 12, false, data.game.devSpeeds)).toEqual([1, 2, 4, 8, 16]);
  });
});
