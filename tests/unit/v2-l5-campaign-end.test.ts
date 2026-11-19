/**
 * V2 검토 L5: 캠페인(개발자 버튼)이 50단계 뒤 끝나지 않고 단계 타이머 0인 채 계속 돌던 것.
 * 결정: 마지막 단계가 끝나는 시각까지 버티면(보스 제한 시간 검사를 먼저 통과) phase = 'victory' + 'victory' 사건 — 그 뒤 sim은 멈춘다.
 * 화면(Game.ts)이 victory를 결과 화면으로 보이는 일은 다른 갈래 소유라 나중 (docs/v2/fixes-notes.md).
 */
import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { isMob } from '../../src/sim/entities/Mob';
import type { Match } from '../../src/sim/match';
import { campaign, data, eventsOf, jumpToStage } from '../helpers/match';

/** 맵 위 몹을 모두 지운다 (보스 포함 — 처치 보상 없이) */
function clearMobs(m: Match): void {
  for (const e of [...m.world.entities.list()]) if (isMob(e)) m.world.entities.remove(e.id);
}

describe('L5 캠페인 클리어', () => {
  it('50단계를 끝까지 버티면 victory (단계는 50 그대로, 패배 아님), 사건 한 번', () => {
    const m = campaign(1);
    jumpToStage(m, 50);
    m.state.lives = 999;
    clearMobs(m);
    eventsOf(m, 'x');
    const end = m.state.nextStageTick;
    let victories = 0;
    while (m.tick <= end + 5) {
      // 보스는 나오는 대로 지운다 (보스 제한 시간 패배가 나지 않게)
      clearMobs(m);
      m.step();
      victories += eventsOf(m, 'victory').length;
    }
    expect(m.state.phase).toBe('victory');
    expect(m.victory).toBe(true);
    expect(m.ended).toBe(true);
    expect(m.defeated).toBe(false);
    expect(m.state.stage).toBe(50);
    expect(victories).toBe(1);
    // 끝난 뒤에는 멈춘다
    const tick = m.tick;
    m.stepN(100);
    expect(m.state.stage).toBe(50);
    expect(m.tick).toBe(tick + 100);
    expect(m.state.phase).toBe('victory');
  });

  it('마지막 보스를 못 잡으면 클리어가 아니라 패배 (제한 시간 또는 성문 도달)', () => {
    const m = campaign(1);
    jumpToStage(m, 50);
    m.state.lives = 999;
    m.stepN(m.rules.bossTimeTicks + m.rules.stageTicks + 5);
    expect(m.state.phase).toBe('defeat');
    expect(['bossTime', 'bossLeak']).toContain(m.state.defeatReason);
  });

  it('49단계에서 한 틱에 3번 눌러도 50단계에서 멈춘다 (연타로 클리어되지 않음), 다음 틱에 한 번 더 누르면 클리어', () => {
    const m = createMatch(data, { seed: 9, mode: 'campaign', theme: 1, debug: true });
    jumpToStage(m, 49);
    for (let i = 0; i < 3; i++) m.world.enqueue({ type: 'debugSkipStage' });
    m.step();
    expect(m.state.stage).toBe(50);
    expect(m.state.phase).toBe('playing');
    m.world.enqueue({ type: 'debugSkipStage' });
    m.step();
    expect(m.state.phase).toBe('victory');
  });

  it('개발자 판: 50단계에서 단계 건너뛰기를 누르면 그 틱에 클리어', () => {
    const m = createMatch(data, { seed: 4, mode: 'campaign', theme: 1, debug: true });
    jumpToStage(m, 50);
    m.world.enqueue({ type: 'debugSkipStage' });
    m.step();
    expect(m.state.stage).toBe(50);
    expect(m.state.phase).toBe('victory');
  });

  it('무한 모드에는 클리어가 없다', () => {
    const m = createMatch(data, { seed: 4, mode: 'infinite', debug: true });
    jumpToStage(m, 50);
    m.world.enqueue({ type: 'debugSkipStage' });
    m.step();
    expect(m.state.stage).toBe(51);
    expect(m.state.phase).toBe('playing');
  });
});
