/**
 * 한 판(Match): World + 맵 + 규칙 + 판 상태 + 시스템 묶음.
 *
 * - 무한 모드: game.json match.infiniteMapId(순환의 정원), 몹 한도 = 맵 mobLimit(150).
 * - 캠페인 테마 t: campaign.json themes[t].mapId(테마 1 = 사거리 미로), 목숨 = 맵 lives(20), 마지막 단계 = stagesPerTheme(50),
 *   체력·방어 보정 = 테마 hpMul·armorOffset (BALANCE.md 5.4).
 * - 시스템 순서 (틱마다): 단계 → 등장 → 이동(출구 도달) → 전투(공격·투사체·처치) → 패배.
 *   전투가 패배 판정보다 먼저라서 같은 틱의 처치가 몹 수에 먼저 반영된다 (UI.md 9장).
 * - 명령: summon(소환), debugSkipStage·debugAddGold(개발용, debug 판에서만).
 * - 덱: 플레이어별 (생략하면 decks.json 기본 덱). 판 시작 때 검사한다.
 * 화면은 match.state·mobs()·towers()를 읽기만 하고, 바꾸려면 명령을 world.enqueue() 한다.
 */
import type { GameData } from '../data/load';
import { World } from './World';
import { listMobs, countMobs, type Mob } from './entities/Mob';
import { listProjectiles, type Projectile } from './entities/Projectile';
import { listTowers, type Tower } from './entities/Tower';
import { buildSimMap, type SimMap } from './map';
import { NO_THEME, buildMatchRules, checkDeck, themeMods, type Deck, type MatchRules, type ThemeMods } from './rules';
import type { MatchContext, MatchMode, MatchState } from './state';
import { createCombatSystem } from './systems/Combat';
import { createDefeatSystem } from './systems/Defeat';
import { createMovementSystem } from './systems/Movement';
import { createSpawnSystem } from './systems/Spawn';
import { createStageSystem, skipStage, ticksToNextStage } from './systems/Stage';
import { summon } from './systems/Summon';

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
  /** 플레이어별 덱 (생략하면 모두 decks.json 기본 덱) */
  decks?: readonly Deck[];
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

  /** 판 위 타워 (ID 순). */
  towers(): Tower[] {
    return listTowers(this.world);
  }

  /** 날아가는 투사체 (ID 순). */
  projectiles(): Projectile[] {
    return listProjectiles(this.world);
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
    summons: 0,
    kills: 0,
    goldEarned: 0,
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
  const players = opts.players ?? 1;
  const decks: Deck[] = [];
  for (let p = 0; p < players; p++) {
    const deck = opts.decks?.[p] ?? rules.baseDeck;
    checkDeck(rules, deck, `플레이어 ${p} 덱`);
    decks.push(deck);
  }
  const ctx: MatchContext = { rules, map, theme, state, decks: Object.freeze(decks) };
  const world = new World({
    seed: opts.seed,
    players,
    maxPlayers: opts.maxPlayers ?? data.game.maxPlayers,
    state,
    systems: [
      createStageSystem(ctx),
      createSpawnSystem(ctx),
      createMovementSystem(ctx),
      createCombatSystem(ctx),
      createDefeatSystem(ctx),
    ],
  });
  world.setCommandHandler('debugSkipStage', () => skipStage(ctx));
  world.setCommandHandler('summon', (w, cmd) => {
    if (cmd.type === 'summon') summon(ctx, w, cmd.player, cmd.x, cmd.y);
  });
  world.setCommandHandler('debugAddGold', (_w, cmd) => {
    if (cmd.type !== 'debugAddGold' || !state.debug || state.phase !== 'playing') return;
    state.debugUsed = true;
    state.gold += cmd.amount;
  });
  return new Match(world, ctx);
}
