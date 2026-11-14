/**
 * 한 판(Match): World + 맵 + 규칙 + 판 상태 + 시스템 묶음.
 *
 * - 무한 모드: game.json match.infiniteMapId(순환의 정원), 몹 한도 = 맵 mobLimit(150).
 * - 캠페인 테마 t: campaign.json themes[t].mapId(테마 1 = 사거리 미로), 목숨 = 맵 lives(20), 마지막 단계 = stagesPerTheme(50),
 *   체력·방어 보정 = 테마 hpMul·armorOffset (BALANCE.md 5.4).
 * - 시스템 순서 (틱마다): 단계 → 등장 → 이동(출구 도달) → 패배. M2부터 대상 선택·공격이 이동과 패배 사이에 들어간다.
 * 화면은 match.state·mobs()를 읽기만 하고, 바꾸려면 명령을 world.enqueue() 한다.
 */
import type { GameData } from '../data/load';
import { World } from './World';
import { listMobs, countMobs, type Mob } from './entities/Mob';
import { buildSimMap, type SimMap } from './map';
import { NO_THEME, buildMatchRules, themeMods, type MatchRules, type ThemeMods } from './rules';
import type { MatchContext, MatchMode, MatchState } from './state';
import { createDefeatSystem } from './systems/Defeat';
import { createMovementSystem } from './systems/Movement';
import { createSpawnSystem } from './systems/Spawn';
import { createStageSystem, skipStage, ticksToNextStage } from './systems/Stage';

export interface MatchOptions {
  seed: number;
  mode: MatchMode;
  /** 캠페인 테마 번호 (1~10). 무한 모드는 무시 */
  theme?: number;
  players?: number;
  /** game.json maxPlayers (생략하면 data에서) */
  maxPlayers?: number;
  /** 개발용 치트 명령을 들어 줄지 (?debug=1). 기본 false */
  debug?: boolean;
}

export class Match {
  readonly world: World;
  readonly ctx: MatchContext;

  constructor(world: World, ctx: MatchContext) {
    this.world = world;
    this.ctx = ctx;
  }

  get state(): MatchState {
    return this.ctx.state;
  }

  get map(): SimMap {
    return this.ctx.map;
  }

  get rules(): MatchRules {
    return this.ctx.rules;
  }

  get tick(): number {
    return this.world.tick;
  }

  step(): void {
    this.world.step();
  }

  stepN(n: number): void {
    this.world.stepN(n);
  }

  /** 살아 있는 몹 (ID 순). */
  mobs(): Mob[] {
    return listMobs(this.world);
  }

  mobCount(): number {
    return countMobs(this.world);
  }

  /** 다음 단계까지 남은 틱. */
  ticksToNextStage(): number {
    return ticksToNextStage(this.ctx, this.world.tick);
  }

  get defeated(): boolean {
    return this.ctx.state.phase === 'defeat';
  }

  hash(): number {
    return this.world.hash();
  }
}

/** 판 만들기. 데이터에 없는 테마·맵이면 에러. */
export function createMatch(data: GameData, opts: MatchOptions): Match {
  const rules = buildMatchRules(data);
  let mapId: string;
  let theme: ThemeMods = NO_THEME;
  let lastStage = 0;
  if (opts.mode === 'campaign') {
    const t = data.campaign.themes.find((x) => x.theme === (opts.theme ?? 1));
    if (!t) throw new Error(`없는 캠페인 테마: ${opts.theme}`);
    mapId = t.mapId;
    theme = themeMods(t);
    lastStage = data.campaign.stagesPerTheme;
  } else {
    mapId = data.game.match.infiniteMapId;
  }
  const mapData = data.maps[mapId];
  if (!mapData) throw new Error(`맵 파일이 아직 없다: ${mapId} (src/data/maps/${mapId}.json)`);
  const map = buildSimMap(mapData);
  if (opts.mode === 'campaign' && map.lives === null) throw new Error(`캠페인 맵 ${mapId}에 lives가 없다`);
  if (opts.mode === 'infinite' && map.mobLimit === null) throw new Error(`무한 모드 맵 ${mapId}에 mobLimit이 없다`);
  const lives = opts.mode === 'campaign' ? (map.lives as number) : 0;

  const state: MatchState = {
    mode: opts.mode,
    theme: theme.theme,
    mapId,
    stage: 0,
    stageStartTick: 0,
    nextStageTick: rules.prepTicks,
    lastStage,
    bossStage: false,
    gold: rules.startGold,
    lives,
    maxLives: lives,
    mobLimit: opts.mode === 'infinite' ? (map.mobLimit as number) : 0,
    leaked: 0,
    spawned: 0,
    phase: 'playing',
    defeatReason: '',
    defeatTick: -1,
    spawnQueue: [],
    spawnNext: 0,
    spawnNextTick: 0,
    spawnStage: 0,
    debug: opts.debug === true,
    debugUsed: false,
  };
  const ctx: MatchContext = { rules, map, theme, state };
  const world = new World({
    seed: opts.seed,
    players: opts.players ?? 1,
    maxPlayers: opts.maxPlayers ?? data.game.maxPlayers,
    state,
    systems: [createStageSystem(ctx), createSpawnSystem(ctx), createMovementSystem(ctx), createDefeatSystem(ctx)],
  });
  world.setCommandHandler('debugSkipStage', () => skipStage(ctx));
  return new Match(world, ctx);
}
