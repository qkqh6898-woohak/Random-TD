/**
 * 피드백 #66 '일꾼 소환 버튼 꾹 누르면 계속 소환되게 하기' — [👷 고용]에 [🎲 소환]과 같은 꾹 누르기(ui/hold.ts attachHoldRepeat).
 * (같은 이슈의 '유닛 크기 주변 유닛 유무에 따라 변하는거 없애기'는 v0.1.17 towerGeom.figureArtScale에 이미 들어 있다 — b1·view-m3 테스트)
 * 이슈 본문·판 기록 JSON이 없어 리플레이 재현 대신: 꾹 누르기 도우미가 고용처럼 '돈·최대에서 false'를 돌려주면 멈추는지,
 * 고용 명령을 되풀이한 판이 최대 인원·돈에서 멈추고 리플레이 왕복이 같은 해시인지 고정한다. 실제 버튼은 e2e/fb66.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_SUMMON_MS, HOLD_DELAY_MS, attachHoldRepeat } from '../../src/ui/hold';
import { hireCheck } from '../../src/sim/systems/Economy';
import { playReplay, recordReplay, replayToJson } from '../../src/sim/replay';
import { arenaData, command, infinite } from '../helpers/match';

/** 포인터 사건만 받는 가짜 버튼 (DOM 없이 — attachHoldRepeat는 addEventListener만 쓴다) */
function fakeButton(): HTMLElement & { press(): void; release(): void } {
  const t = new EventTarget() as HTMLElement & { press(): void; release(): void };
  t.press = () => t.dispatchEvent(Object.assign(new Event('pointerdown'), { button: 0 }));
  t.release = () => {
    t.dispatchEvent(new Event('pointerup'));
    t.dispatchEvent(new Event('click'));
  };
  return t;
}

describe('피드백 #66 [👷 고용] 꾹 누르기', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Hud가 붙이는 것과 같은 간격: 처음 HOLD_DELAY_MS, 그 뒤 소환 간격 */
  const hireDelay = (n: number): number => (n <= 0 ? HOLD_DELAY_MS : AUTO_SUMMON_MS);

  it('짧게 누르면 한 번 (포인터 뒤 따라오는 click은 두 번 세지 않음)', () => {
    const btn = fakeButton();
    let hired = 0;
    attachHoldRepeat(btn, () => (hired++, true), { delay: hireDelay });
    btn.press();
    vi.advanceTimersByTime(HOLD_DELAY_MS - 10);
    btn.release();
    vi.advanceTimersByTime(2000);
    expect(hired).toBe(1);
  });

  it('꾹 누르면 첫 기다림 뒤 소환 간격마다 계속, 손을 떼면 멈춤', () => {
    const btn = fakeButton();
    let hired = 0;
    attachHoldRepeat(btn, () => (hired++, true), { delay: hireDelay });
    btn.press();
    vi.advanceTimersByTime(HOLD_DELAY_MS + 3 * AUTO_SUMMON_MS + 10);
    expect(hired).toBe(1 + 1 + 3);
    btn.release();
    vi.advanceTimersByTime(3000);
    expect(hired).toBe(5);
  });

  it('고용이 false(돈 부족·최대)를 돌려주면 누르고 있어도 멈춘다', () => {
    const btn = fakeButton();
    let left = 3;
    let calls = 0;
    attachHoldRepeat(btn, () => (calls++, left-- > 0), { delay: hireDelay });
    btn.press();
    vi.advanceTimersByTime(10_000);
    expect(calls).toBe(4); // 3명 + 실패 한 번(알림) 뒤 멈춤
  });
});

describe('피드백 #66 고용 명령 되풀이 (sim)', () => {
  it('돈이 넉넉하면 최대 인원에서, 아니면 돈이 허락하는 만큼에서 멈추고 리플레이 왕복은 같은 해시', () => {
    const m = infinite(6601, { debug: true });
    const { workerCost, workerMax } = m.rules;
    const affordable = Math.floor(m.state.gold / workerCost);
    for (let i = 0; i < workerMax + 3 && !hireCheck(m.ctx); i++) command(m, { type: 'hireWorker' });
    expect(m.state.workers).toBe(Math.min(affordable, workerMax));
    expect(hireCheck(m.ctx)).not.toBeNull();
    command(m, { type: 'debugAddGold', amount: workerCost * workerMax * 2 });
    for (let i = 0; i < workerMax + 3 && !hireCheck(m.ctx); i++) command(m, { type: 'hireWorker' });
    expect(m.state.workers).toBe(workerMax);
    expect(hireCheck(m.ctx)).toBe('max');
    m.stepN(40);
    const r = playReplay(arenaData, JSON.parse(replayToJson(recordReplay(arenaData, m, { name: 'fb66-hire-hold' }))));
    expect(r.mismatch).toBeNull();
    expect(r.hash).toBe(m.hash());
  });
});
