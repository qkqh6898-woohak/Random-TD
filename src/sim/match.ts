/**
 * 한 판(Match): World + 맵 + 규칙 + 판 상태 + 시스템 묶음.
 *
 * - 무한 모드: game.json match.infiniteMapId(순환의 정원), 몹 한도 = 맵 mobLimit(150).
 * - 캠페인 테마 t: campaign.json themes[t].mapId(테마 1 = 사거리 미로), 목숨 = 맵 lives(20), 마지막 단계 = stagesPerTheme(50),
 *   체력·방어 보정 = 테마 hpMul·armorOffset (BALANCE.md 5.4).
 * - 시스템 순서 (틱마다): 단계(보스 제한 시간·편대 예고) → 도전(제한 시간·쿨타임 끝, M5-2) → 등장(보스·편대·정예)
 *   → 상태 이상(지속 피해·풀림) → 몹 특성(치유·가속·보스 패턴·도전 보스 능력) → 이동(출구 도달) → 감지(투명 몹 드러내기)
 *   → 특색 능력(주기 능력·진흙 웅덩이) → 소환 병사 → 전투(공격·투사체·처치·깨짐·보스 처치) → 경제(일꾼 수입) → 미션(M5-6) → 패배.
 *   전투가 패배 판정보다 먼저라서 같은 틱의 처치가 몹 수에 먼저 반영된다 (UI.md 9장). 감지는 이동 다음이라 이번 틱 위치로 드러낸다.
 * - 명령: summon(소환), merge·mergeAll(승급·모두 승급), move(이동·교환), hold(끄는 동안 공격 정지),
 *   hireWorker(일꾼), pickCard(보스 카드), pickMerge(승급의 축복), upgrade(판 내 강화), gamble(도박), startChallenge(도전),
 *   claimMission·claimAllMissions(미션 보상), sellTower(판매, T-2),
 *   debugSkipStage·debugAddGold·debugTower·debugCard·debugConvertTower·debugSetChance(개발용, debug 판에서만).
 * - 계정 레벨: 플레이어별 (도박 1000원 Lv7·10000원 Lv20 해금, 생략하면 1). 판 시작 때 정해진 입력.
 * - 덱: 플레이어별 (생략하면 decks.json 기본 덱). 판 시작 때 등급별로 복사·동결하고 검사한다 (판 도중 바깥에서 못 바꿈).
 * - 타워 레벨: 플레이어별 (타워 id → 1~15, 생략하면 모두 1). 판 시작 때 복사·동결 (특색 수치 보간·레벨당 공격력, M3-8).
 * 화면은 match.state·mobs()·towers()를 읽기만 하고, 바꾸려면 명령을 world.enqueue() 한다.
 */
import type { GameData } from '../data/load';
import { World, type System } from './World';
import { listMobs, countMobs, type Mob } from './entities/Mob';
import { listProjectiles, type Projectile } from './entities/Projectile';
import { listTowers, towerAt, type Tower } from './entities/Tower';
import { listPuddles, type Puddle } from './entities/Puddle';
import { listSoldiers, type Soldier } from './entities/Soldier';
import { buildSimMap, isBuildable, type SimMap } from './map';
import { checkAllAbilityParams } from './abilities';
import { createAbilitySystem } from './systems/Abilities';
import { createSoldierSystem } from './systems/Soldiers';
import { createStatusSystem } from './systems/Status';
import { NO_THEME, buildMatchRules, checkDeck, freezeDeck, themeMods, type Deck, type MatchRules, type ThemeMods } from './rules';
import { MISSION_OPEN, newGambleState, newPlayerPerks, type MatchContext, type MatchMode, type MatchState } from './state';
import { newPlayerMods } from './stats';
import { createCombatSystem } from './systems/Combat';
import { createDefeatSystem } from './systems/Defeat';
import { createMovementSystem } from './systems/Movement';
import { createSpawnSystem } from './systems/Spawn';
import { createStageSystem, skipStage, ticksToNextStage } from './systems/Stage';
import { merge, mergeAll, pickMerge } from './systems/Merge';
import { createMobTraitSystem } from './systems/MobTraits';
import { createDetectionSystem } from './systems/Detection';
import { createEconomySystem, hireWorker } from './systems/Economy';
import { applyCard, pickCard } from './systems/Cards';
import { checkAllBossParams } from './bosses';
import { holdTower, moveTower } from './systems/Move';
import { placeTower, summon } from './systems/Summon';
import { upgrade } from './systems/Upgrade';
import { gamble } from './systems/Gamble';
import { createChallengeSystem, startChallenge } from './systems/Challenge';
import { claimAllMissions, claimMission, installMissionTracker } from './systems/Mission';
import { convertTower, sellTower } from './systems/Sell';
import { setChance } from './chances';

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
  /** 플레이어별 타워 레벨 (타워 id → 1~15, 없는 타워는 1). 계정 성장(M9)이 넣는다 */
  levels?: readonly Readonly<Record<string, number>>[];
  /** 플레이어별 계정 레벨 (도박 테이블 해금, M5-5). 메타(src/meta/account.ts)가 넣고 생략하면 1 */
  accountLevels?: readonly number[];
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

  /** 진흙 웅덩이 (ID 순). */
  puddles(): Puddle[] {
    return listPuddles(this.world);
  }

  /** 소환 병사 (ID 순). */
  soldiers(): Soldier[] {
    return listSoldiers(this.world);
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
    merges: 0,
    moves: 0,
    mods: [],
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
    workers: 0,
    workerMul: 1,
    bossId: '',
    bossNum: 0,
    bossMaxHp: 0,
    bossDeadline: 0,
    bossesKilled: 0,
    formationStage: 0,
    formation: '',
    invisibleWarned: false,
    cardOffers: [],
    cardsPicked: [],
    summonDiscount: 0,
    mobSlowBp: 0,
    goldPctBp: 0,
    perks: [],
    mergePicks: [],
    upgrades: [],
    upgradesBought: 0,
    gambles: 0,
    gamble: [],
    challengeLevel: 0,
    challengePlayer: 0,
    challengeStart: 0,
    challengeUntil: 0,
    challengeMobs: [],
    challengeMaxHp: 0,
    challengeOpen: 1,
    challengeReady: rules.challenges.map(() => 0),
    challengeClears: 0,
    challengeBest: 0,
    missionStatus: rules.missions.map(() => MISSION_OPEN),
    missionCount: rules.missions.map(() => 0),
    lastActTick: 0,
    dangerStage: 0,
  };
  const players = opts.players ?? 1;
  for (let p = 0; p < players; p++) {
    state.mods.push(newPlayerMods());
    state.perks.push(newPlayerPerks());
    state.upgrades.push(rules.upgrades.map(() => 0));
    state.gamble.push(newGambleState());
  }
  const accountLevels: number[] = [];
  for (let p = 0; p < players; p++) {
    const lv = opts.accountLevels?.[p] ?? 1;
    if (!Number.isSafeInteger(lv) || lv < 1) throw new Error(`플레이어 ${p} 계정 레벨: ${lv} (1 이상 정수여야 한다)`);
    accountLevels.push(lv);
  }
  const decks: Deck[] = [];
  for (let p = 0; p < players; p++) {
    // 등급별로 복사해 얼린다 → 판 도중 호출자가 원본 덱을 고쳐도 소환·승급이 바뀌지 않는다 (리플레이 = 시드 + 시작 때 덱)
    const deck = freezeDeck(opts.decks?.[p] ?? rules.baseDeck);
    checkDeck(rules, deck, `플레이어 ${p} 덱`);
    decks.push(deck);
  }
  const levels: Readonly<Record<string, number>>[] = [];
  for (let p = 0; p < players; p++) {
    const src = opts.levels?.[p] ?? {};
    const out: Record<string, number> = {};
    for (const id of Object.keys(src).sort()) {
      const lv = src[id] as number;
      if (!rules.towers.has(id)) throw new Error(`플레이어 ${p} 타워 레벨: 없는 타워 ${id}`);
      if (!Number.isSafeInteger(lv) || lv < 1 || lv > rules.towerLevelMax) {
        throw new Error(`플레이어 ${p} 타워 레벨: ${id} = ${lv} (1~${rules.towerLevelMax} 정수여야 한다)`);
      }
      out[id] = lv;
    }
    levels.push(Object.freeze(out));
  }
  const ctx: MatchContext = {
    rules,
    map,
    theme,
    state,
    decks: Object.freeze(decks),
    levels: Object.freeze(levels),
    cache: new Map(),
    accountLevels: Object.freeze(accountLevels),
  };
  // 특색 수치가 잘못되면 판을 만들 때 바로 드러나게 (덱에 있는 타워만이 아니라 모든 능력 모듈)
  checkAllAbilityParams(ctx);
  checkAllBossParams(ctx);
  // 미션 추적기는 World의 사건을 구독하므로 World를 만든 뒤에 채운다 (자리는 경제 다음·패배 앞)
  let missionSystem: System = () => {};
  const world = new World({
    seed: opts.seed,
    players,
    maxPlayers: opts.maxPlayers ?? data.game.maxPlayers,
    state,
    systems: [
      createStageSystem(ctx),
      createChallengeSystem(ctx),
      createSpawnSystem(ctx),
      createStatusSystem(ctx),
      createMobTraitSystem(ctx),
      createMovementSystem(ctx),
      createDetectionSystem(ctx),
      createAbilitySystem(ctx),
      createSoldierSystem(ctx),
      createCombatSystem(ctx),
      createEconomySystem(ctx),
      (w) => missionSystem(w),
      createDefeatSystem(ctx),
    ],
  });
  missionSystem = installMissionTracker(ctx, world);
  world.setCommandHandler('upgrade', (w, cmd) => {
    if (cmd.type === 'upgrade') upgrade(ctx, w, cmd.player, cmd.k);
  });
  world.setCommandHandler('gamble', (w, cmd) => {
    if (cmd.type === 'gamble') gamble(ctx, w, cmd.player, cmd.t);
  });
  world.setCommandHandler('startChallenge', (w, cmd) => {
    if (cmd.type === 'startChallenge') startChallenge(ctx, w, cmd.player, cmd.lv);
  });
  world.setCommandHandler('claimMission', (w, cmd) => {
    if (cmd.type === 'claimMission') claimMission(ctx, w, cmd.i);
  });
  world.setCommandHandler('claimAllMissions', (w) => claimAllMissions(ctx, w));
  world.setCommandHandler('sellTower', (w, cmd) => {
    if (cmd.type === 'sellTower') sellTower(ctx, w, cmd.player, cmd.x, cmd.y);
  });
  world.setCommandHandler('debugConvertTower', (w, cmd) => {
    if (cmd.type === 'debugConvertTower') convertTower(ctx, w, cmd.player, cmd.x, cmd.y, cmd.t);
  });
  world.setCommandHandler('debugSetChance', (w, cmd) => {
    if (cmd.type === 'debugSetChance') setChance(ctx, w, cmd.player, cmd.key, cmd.bp);
  });
  world.setCommandHandler('debugSkipStage', (w) => skipStage(ctx, w));
  world.setCommandHandler('hireWorker', (w, cmd) => {
    if (cmd.type === 'hireWorker') hireWorker(ctx, w, cmd.player);
  });
  world.setCommandHandler('pickCard', (w, cmd) => {
    if (cmd.type === 'pickCard') pickCard(ctx, w, cmd.player, cmd.i);
  });
  world.setCommandHandler('pickMerge', (w, cmd) => {
    if (cmd.type === 'pickMerge') pickMerge(ctx, w, cmd.player, cmd.id, cmd.pick);
  });
  world.setCommandHandler('summon', (w, cmd) => {
    if (cmd.type === 'summon') summon(ctx, w, cmd.player, cmd.x, cmd.y);
  });
  world.setCommandHandler('merge', (w, cmd) => {
    if (cmd.type === 'merge') merge(ctx, w, cmd.player, cmd.x, cmd.y);
  });
  world.setCommandHandler('mergeAll', (w, cmd) => {
    if (cmd.type === 'mergeAll') mergeAll(ctx, w, cmd.player, cmd.x, cmd.y);
  });
  world.setCommandHandler('move', (w, cmd) => {
    if (cmd.type === 'move') moveTower(ctx, w, cmd.player, cmd.fx, cmd.fy, cmd.tx, cmd.ty);
  });
  world.setCommandHandler('hold', (w, cmd) => {
    if (cmd.type === 'hold') holdTower(ctx, w, cmd.player, cmd.x, cmd.y, cmd.on === 1);
  });
  world.setCommandHandler('debugAddGold', (_w, cmd) => {
    if (cmd.type !== 'debugAddGold' || !state.debug || state.phase !== 'playing') return;
    state.debugUsed = true;
    state.gold += cmd.amount;
  });
  world.setCommandHandler('debugCard', (w, cmd) => {
    if (cmd.type !== 'debugCard' || !state.debug || state.phase !== 'playing') return;
    const card = rules.cards[cmd.c];
    if (!card) return;
    state.debugUsed = true;
    applyCard(ctx, w, cmd.player, card, state.bossNum > 0 ? state.bossNum : 1);
    w.emit('cardPick', { player: cmd.player, card: card.id, boss: 0, debug: true });
  });
  world.setCommandHandler('debugTower', (w, cmd) => {
    if (cmd.type !== 'debugTower' || !state.debug || state.phase !== 'playing') return;
    const id = rules.towerOrder[cmd.t];
    if (id === undefined || !isBuildable(map, cmd.x, cmd.y) || towerAt(w, cmd.x, cmd.y)) return;
    state.debugUsed = true;
    const t = placeTower(w, id, cmd.player, cmd.x, cmd.y);
    w.emit('summon', { id: t.id, tower: id, grade: rules.towers.get(id)?.grade ?? '', god: false, rare: false, player: cmd.player, x: cmd.x, y: cmd.y });
  });
  return new Match(world, ctx);
}
