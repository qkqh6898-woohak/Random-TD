/**
 * v0.1.22 사용자 결정 B① 정보 패널 머리줄 버튼: [⬆ 승급] [↔ 이동] [판매] [✕], 아래 버튼 줄 없음,
 * 모두 승급 = [⬆ 승급] 꾹 누르기(0.5초), 못 하면 차분한 회색 + 이유(aria-label). 화면 확인은 e2e/v22-screens.spec.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LONG_PRESS_MS, longPressAction } from '../../src/ui/hold';
import { buildTowerPanelModel } from '../../src/ui/panels/towerPanelModel';
import { effectiveStats } from '../../src/sim/stats';
import { arena, data } from '../helpers/match';

function model(grade: string, owned: number, mergeableGrade = true, readyStacks?: number) {
  const m = arena();
  const t = data.towers.towers.find((x) => x.grade === grade)!;
  const stats = m.rules.towers.get(t.id)!;
  return buildTowerPanelModel({ data: t, stats, eff: effectiveStats(m.rules, stats), factionName: 'x', owned, mergeCount: 3, mergeableGrade, outcomes: [], paused: false, penMaxBp: 9000, ...(readyStacks !== undefined ? { readyStacks } : {}) });
}

describe('v0.1.22 꾹 눌러 모두 승급', () => {
  it('0.5초 이상 + 모두 승급이 뜻이 있을 때만 long', () => {
    expect(LONG_PRESS_MS).toBe(500);
    expect(longPressAction(499, true)).toBe('tap');
    expect(longPressAction(500, true)).toBe('long');
    expect(longPressAction(2000, false)).toBe('tap');
  });

  it('승급 버튼 이름·꾹 표시: 판 위 승급할 무더기가 이 칸뿐이면 표시 없음, 둘 이상이면 꾹 ×n(판 전체), 못 하면 이유', () => {
    const one = model('normal', 3);
    expect(one.mergeEnabled).toBe(true);
    expect(one.mergeAllCount).toBe(1);
    expect(one.mergeHoldHint).toBe('');
    expect(one.mergeLabel).toBe('승급');
    const two = model('normal', 3, true, 3);
    expect(two.mergeHoldHint).toBe('꾹 ×3');
    expect(two.mergeLabel).toBe('승급 · 꾹 누르면 모두 승급 ×3');
    expect(two.mergeAllEnabled).toBe(true);
    // 이 칸은 못 해도 다른 무더기가 있으면 숨은 [모두 승급]은 켜짐 (꾹 누르기는 꺼진 [⬆ 승급]이라 없음)
    const other = model('normal', 1, true, 2);
    expect(other.mergeEnabled).toBe(false);
    expect(other.mergeAllEnabled).toBe(true);
    expect(other.mergeHoldHint).toBe('');
    const few = model('normal', 1);
    expect(few.mergeEnabled).toBe(false);
    expect(few.mergeHoldHint).toBe('');
    expect(few.mergeLabel).toBe('승급할 수 없어요 — 같은 타워 3개가 한 칸에 모이면 승급할 수 있어요');
    const legend = model('legend', 3, false);
    expect(legend.mergeLabel).toBe('승급할 수 없어요 — 레전드는 승급할 수 없어요 (리미티드 재료)');
  });

  it('조립: 버튼은 머리줄 하나에, 아래 버튼 줄 없음 · 모두 승급 버튼은 숨은 접근용 · 안내 줄은 숨은 설명', () => {
    const src = readFileSync(new URL('../../src/ui/panels/TowerPanel.ts', import.meta.url), 'utf8');
    expect(src).toContain("h('div', { class: 'tp-head-actions' }, mergeBtn, moveBtn, convertBtn, sellBtn, close)");
    expect(src).toContain("class: 'btn tp-merge-all tp-sr'");
    expect(src).toContain("class: 'tp-note tp-sr'");
    expect(src).toContain('attachLongPress(mergeBtn');
    expect(src).toContain('canMergeAll = m.mergeEnabled && m.mergeAllCount > 1;');
    const game = readFileSync(new URL('../../src/view/scenes/Game.ts', import.meta.url), 'utf8');
    expect(game).toContain('onMergeAll: () => void this.sendMergeAll(),');
    expect(game).toContain('readyStacks: this.mergeReadyCount,');
    expect(src).not.toContain('tp-actions');
    const css = readFileSync(new URL('../../src/ui/battle/battleV2.css', import.meta.url), 'utf8');
    // 못 하면 차분한 회색 (빨간 글자 아님)
    expect(css).toMatch(/\.tp-head-actions > \.tp-merge:disabled \{ background:var\(--rtd-disabled\); color:var\(--rtd-muted-ink\)/);
    // 작은 정보 글자 12px 이상
    expect(css).toContain('.battle-v2 .tower-panel { font-size:max(12px,3.4cqw); }');
  });
});
