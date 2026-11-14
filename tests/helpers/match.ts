/** 테스트 도우미: 판 만들기·몹 넣기. */
import { loadGameData, type GameData } from '../../src/data/load';
import { createMatch, type Match, type MatchOptions } from '../../src/sim/match';
import type { CommandInput } from '../../src/sim/Commands';
import type { Mob } from '../../src/sim/entities/Mob';
import { towerAt, type Tower } from '../../src/sim/entities/Tower';
import { spawnMob } from '../../src/sim/systems/Spawn';

export const data: GameData = loadGameData();

export function infinite(seed = 1, extra: Partial<MatchOptions> = {}): Match {
  return createMatch(data, { seed, mode: 'infinite', ...extra });
}

export function campaign(theme = 1, seed = 1): Match {
  return createMatch(data, { seed, mode: 'campaign', theme });
}

/** 지금 단계 기준으로 몹 한 마리를 바로 넣는다 (등장 시스템을 거치지 않음). */
export function addMob(match: Match, mobId: string): Mob {
  return spawnMob(match.ctx, match.world, mobId);
}

/** 그 단계가 시작된 직후까지 진행. 패배하거나 너무 오래 걸리면 에러 (테스트가 멈추지 않게). */
export function runToStage(match: Match, stage: number): void {
  const limit = match.tick + match.rules.prepTicks + stage * match.rules.stageTicks + 1;
  while (match.state.stage < stage) {
    if (match.defeated) throw new Error(`${stage}단계 전에 패배 (${match.state.stage}단계, ${match.state.defeatReason})`);
    if (match.tick > limit) throw new Error(`${stage}단계까지 가지 못함 (틱 ${match.tick})`);
    match.step();
  }
}

/** 다음 틱에 바로 그 단계가 시작되게 상태를 옮긴다 (몹 없이 높은 단계를 시험할 때). */
export function jumpToStage(match: Match, stage: number): void {
  match.state.stage = stage - 1;
  match.state.nextStageTick = match.tick;
  match.step();
}

/** 명령 하나를 넣고 1틱 진행 (명령은 그 틱에 실행된다). */
export function command(match: Match, input: CommandInput): void {
  const r = match.world.enqueue(input);
  if (!r.ok) throw new Error(`명령 거절: ${r.reason}`);
  match.step();
}

/** 칸 (x, y)에 소환 명령을 넣고 1틱 진행. 놓인 타워 (없으면 undefined). */
export function summonAt(match: Match, x: number, y: number, player = 0): Tower | undefined {
  command(match, { type: 'summon', x, y, player });
  return towerAt(match.world, x, y);
}
