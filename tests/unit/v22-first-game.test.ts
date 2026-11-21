/**
 * v0.1.22 사용자 결정 E① 시작할 때 흰 추천 칸·'빛나는 칸을 눌러 소환해요'는 플레이어의 첫 판에서만.
 * 새 저장 형식 없이 계정 도움말 기록(guides)과 판 밖 누적 기록(totals)으로 정한다. 화면은 e2e/v22-screens.spec.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccountStore } from '../../src/meta/account';
import { MemoryStorage } from '../../src/save/storage';
import { GUIDE_FIRST_MERGE, GUIDE_FIRST_SUMMON, isFirstGame, showRecommended } from '../../src/ui/guide/guideModel';

const zero = { matches: 0, summons: 0 };

describe('v0.1.22 첫 판에서만 추천 칸', () => {
  it('빈 계정 = 첫 판, 첫 소환·첫 승급 안내 기록이나 누적 판·소환이 있으면 아님', () => {
    expect(isFirstGame(() => false, zero)).toBe(true);
    expect(isFirstGame(() => false, null)).toBe(true);
    expect(isFirstGame((id) => id === GUIDE_FIRST_SUMMON, zero)).toBe(false);
    expect(isFirstGame((id) => id === GUIDE_FIRST_MERGE, zero)).toBe(false);
    expect(isFirstGame(() => false, { matches: 1, summons: 0 })).toBe(false);
    expect(isFirstGame(() => false, { matches: 0, summons: 3 })).toBe(false);
  });

  it('계정 저장: 첫 소환 기록은 기존 guides 목록에 들어가고(형식 그대로), 다시 읽어도 남는다 · [도움말 다시 보기]가 지운다', () => {
    const st = new MemoryStorage();
    const a = createAccountStore(st);
    expect(isFirstGame((id) => a.guideSeen(id), zero)).toBe(true);
    expect(a.markGuide(GUIDE_FIRST_SUMMON)).toBe(true);
    const raw = JSON.parse(st.getItem('rtd.account')!) as { v: number; guides: string[] };
    expect(raw.v).toBe(1);
    expect(raw.guides).toContain(GUIDE_FIRST_SUMMON);
    const b = createAccountStore(st);
    expect(isFirstGame((id) => b.guideSeen(id), zero)).toBe(false);
    b.resetGuides();
    expect(isFirstGame((id) => b.guideSeen(id), zero)).toBe(true);
    expect(isFirstGame((id) => b.guideSeen(id), { matches: 2, summons: 40 })).toBe(false);
  });

  it('Game 장면: 추천 칸·안내 = 첫 판 && 예전 조건, 첫 타워를 놓으면 기록', () => {
    expect(showRecommended('playing', 0, 0)).toBe(true);
    const game = readFileSync(new URL('../../src/view/scenes/Game.ts', import.meta.url), 'utf8');
    expect(game).toContain('const recommendOn = this.firstGame && showRecommended(state.phase, state.summons, mine.length);');
    expect(game).toContain('this.ctx.account.markGuide(GUIDE_FIRST_SUMMON);');
    expect(game).toContain('isFirstGame((id) => this.ctx.account.guideSeen(id), this.ctx.progress?.state.totals)');
  });
});
