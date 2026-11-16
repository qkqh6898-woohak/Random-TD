/** 테스트 도우미: 판 만들기·몹 넣기. */
import { loadGameData, type GameData, type MapData } from '../../src/data/load';
import circleV1 from '../fixtures/maps/circle-v1.json';
import { createMatch, type Match, type MatchOptions } from '../../src/sim/match';
import type { CommandInput } from '../../src/sim/Commands';
import type { Mob } from '../../src/sim/entities/Mob';
import { towerAt, type Tower } from '../../src/sim/entities/Tower';
import { spawnMob } from '../../src/sim/systems/Spawn';

export const data: GameData = loadGameData();

/**
 * 규칙 테스트용 시험장 데이터 (T-3): 무한 모드 맵만 예전 순환의 정원 v1 (9×11, 배치 71칸, 사각 고리 28칸 — tests/fixtures/maps).
 * 게임 맵(src/data/maps/circle.json v2, 7×11·2×2 블록 32칸)이 바뀌어도 규칙 테스트의 칸 좌표(예: 진행도 3000 = 칸 (4, 1),
 * 그 옆 (4, 2)·(4, 0) 타워)가 흔들리지 않게 고정한 맵이다. 실제 맵을 쓰는 판은 `realInfinite` · `createMatch(data, …)`.
 */
export const arenaData: GameData = { ...data, maps: { ...data.maps, circle: circleV1 as unknown as MapData } };

/** 무한 판 (시험장 맵 = 예전 순환의 정원 v1 — 칸 좌표를 쓰는 규칙 테스트용) */
export function infinite(seed = 1, extra: Partial<MatchOptions> = {}): Match {
  return createMatch(arenaData, { seed, mode: 'infinite', ...extra });
}

/** 무한 판 (실제 게임 맵 = 순환의 정원 v2) */
export function realInfinite(seed = 1, extra: Partial<MatchOptions> = {}): Match {
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
  // 보스 단계는 max(단계 길이, 보스 시간)만큼 길다 (B-2) → 보스 단계 수만큼 여유
  const r = match.rules;
  const extra = Math.max(0, r.bossTimeTicks - r.stageTicks) * Math.ceil(stage / r.bossEvery);
  const limit = match.tick + r.prepTicks + stage * r.stageTicks + extra + 1;
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

/**
 * 시험장: 무한 판 1단계, 단계·등장 시스템이 끼어들지 않게 (다음 단계를 멀리, 1단계 등장 대기열은 이미 만든 것으로).
 * 순환의 정원 경로: 진행도 0 = 칸 (1, 1), 3000 = 칸 (4, 1) — 칸 (4, 2)·(4, 0)의 타워와 1칸.
 */
export function arena(seed = 1, extra: Partial<MatchOptions> = {}): Match {
  const m = infinite(seed, extra);
  m.state.stage = 1;
  m.state.nextStageTick = 1_000_000;
  m.state.spawnStage = 1;
  return m;
}

/** 시험장에 몹 한 마리를 진행도 progress에 세운다 (기본 속도 0 = 제자리). */
export function mobAt(match: Match, mobId: string, progress: number, speed = 0): Mob {
  const mob = addMob(match, mobId);
  mob.progress = progress;
  mob.speed = speed;
  return mob;
}

/** 그 틱까지 난 사건 중 종류가 type인 것 (헤드리스 판은 사건이 쌓여 있다). */
export function eventsOf(match: Match, type: string): ReturnType<Match['world']['drainEvents']> {
  return match.world.drainEvents().filter((e) => e.type === type);
}
