/**
 * World: 판 전체의 결정적 상태 + 고정 틱 진행.
 *
 * - 로직은 초당 20틱(1틱 = 50ms) 고정 (CLAUDE.md 2장 4번). 시간은 틱 번호로만 센다.
 * - `step()` 1회 = 1틱: ① 이 틱에 예약된 명령을 (플레이어, seq) 순으로 실행 ② 시스템을 등록 순서대로 실행 ③ tick + 1.
 *   ①에서 이 틱의 명령을 꺼내면 이 틱은 닫힌다. step 도중(시스템·처리기 안)에 넣는 명령은 다음 틱부터 예약된다.
 * - 렌더 루프와는 `TickClock`(누적 시간 방식)으로 분리한다. 화면은 프레임마다 흐른 시간을 넘기고,
 *   TickClock이 돌려준 수만큼 `step()`을 부른다. 배속은 한 프레임에 여러 틱을 돌리는 것으로 구현한다.
 * - Phaser·DOM·window를 모른다. 화면은 상태를 읽기만 하고, 바꾸려면 `enqueue()`로 명령을 넣는다.
 */

import { COMMAND_TYPES, CommandQueue, validateCommand, type Command, type CommandInput, type CommandType, type EnqueueResult } from './Commands';
import { hashValue } from './hash';
import { Rng, type RngSnapshot } from './Rng';

/** 로직 틱 주파수 (Hz). 결정성 규칙이라 데이터가 아닌 코드 상수로 고정한다. */
export const TICK_HZ = 20;
/** 1틱의 길이 (ms). */
export const TICK_MS = 1000 / TICK_HZ;

/** 초 → 틱 (정수 초만). 예: secondsToTicks(60) = 1200. */
export function secondsToTicks(seconds: number): number {
  return seconds * TICK_HZ;
}

/** 모든 엔티티의 공통 모양. 필드 값은 정수·문자열·불리언·그 배열/객체만 (해시가 소수를 거부한다). */
export interface Entity {
  id: number;
  kind: string;
  [field: string]: unknown;
}

/** ID 순서를 보장하는 엔티티 저장소. 반복은 항상 ID 오름차순 (CLAUDE.md 2장 3번). */
export class EntityStore<T extends Entity = Entity> {
  private readonly map = new Map<number, T>();
  private sortedCache: T[] | null = null;
  private nextIdValue = 1;

  /** 새 ID를 붙여 추가. */
  add(entity: Omit<T, 'id'>): T {
    const e = { ...entity, id: this.nextIdValue++ } as T;
    this.map.set(e.id, e);
    this.sortedCache = null;
    return e;
  }

  /** 스냅샷 복원용: ID를 그대로 넣는다. */
  insert(entity: T): void {
    if (this.map.has(entity.id)) throw new Error(`엔티티 ID 중복: ${entity.id}`);
    this.map.set(entity.id, entity);
    if (entity.id >= this.nextIdValue) this.nextIdValue = entity.id + 1;
    this.sortedCache = null;
  }

  get(id: number): T | undefined {
    return this.map.get(id);
  }

  has(id: number): boolean {
    return this.map.has(id);
  }

  remove(id: number): boolean {
    const removed = this.map.delete(id);
    if (removed) this.sortedCache = null;
    return removed;
  }

  get size(): number {
    return this.map.size;
  }

  get nextId(): number {
    return this.nextIdValue;
  }

  /** 저장 복원용 (A-1): 지워진 엔티티가 썼던 번호까지 이어 가도록 다음 ID를 맞춘다. 지금 가진 ID보다 작으면 에러. */
  restoreNextId(nextId: number): void {
    if (!Number.isSafeInteger(nextId) || nextId < this.nextIdValue) throw new Error(`저장된 다음 엔티티 ID가 잘못됐다: ${nextId}`);
    this.nextIdValue = nextId;
  }

  /** ID 오름차순 배열 (읽기 전용으로 쓸 것). */
  list(): readonly T[] {
    if (!this.sortedCache) this.sortedCache = [...this.map.values()].sort((a, b) => a.id - b.id);
    return this.sortedCache;
  }
}

/** 화면에 알리는 사건 (피해 숫자, 소리 등). 화면은 `drainEvents()`로 가져간다. */
export interface SimEvent {
  tick: number;
  type: string;
  [key: string]: string | number | boolean;
}

/** 틱마다 실행되는 규칙. 등록 순서대로 돈다. */
export type System = (world: World) => void;

/** 명령 처리기. */
export type CommandHandler = (world: World, command: Command) => void;

/**
 * 사건 구독자 (M5-6 미션 추적기): emit하는 순간 같은 틱 안에서 바로 불린다 (등록 순서대로).
 * sim 안의 규칙(미션)만 등록한다 — 상태를 바꿔도 같은 입력이면 같은 순서로 불리므로 결정적이다. 화면은 drainEvents로 읽는다.
 */
export type EventListener = (world: World, event: SimEvent) => void;

export interface WorldOptions {
  /** 판 시드 (32비트 정수) */
  seed: number;
  /** 플레이어 수 (1 ~ maxPlayers, 기본 1) */
  players?: number;
  /**
   * 한 판 최대 인원 = `game.json`의 maxPlayers. 화면은 데이터 값을 그대로 넘긴다 (코드에 숫자를 박지 않는다).
   * 생략하면 players 자체만 검사한다 (헤드리스 테스트용).
   */
  maxPlayers?: number;
  /** 틱마다 돌릴 시스템 (기본 없음) */
  systems?: System[];
  /**
   * 판 상태 (단계·목숨·돈 …). 시스템이 고치고 해시에 들어간다 → 정수·문자열·불리언과 그 배열/객체만.
   * 모양은 쓰는 쪽이 정한다 (M1: `src/sim/state.ts` MatchState). 기본 빈 객체.
   */
  state?: object;
  /**
   * 화면이 가져가지 않은 사건을 최대 몇 개까지 들고 있을지 (기본 DEFAULT_MAX_EVENTS).
   * 헤드리스 판(테스트·M11 봇)은 drainEvents를 부르지 않아 피해 사건이 계속 쌓이므로, 넘치면 오래된 것부터 버린다.
   */
  maxEvents?: number;
}

/** 쌓아 두는 사건 수 기본 한도. 화면은 매 프레임 가져가므로 한 프레임에 이만큼 쌓일 일은 없다. */
export const DEFAULT_MAX_EVENTS = 10_000;

/** 난수 흐름 이름. 흐름끼리 독립이다 (MULTIPLAYER.md 4.2). */
export const STREAM_WORLD = 'world';
/** 전투 판정(치명타 등, M3-4). 세계(몹 등장) 흐름과 나눠서 타워 배치가 몹 등장 순서를 바꾸지 않게 한다 */
export const STREAM_COMBAT = 'combat';
/** 보스 패턴 판정 (혼돈의 용 타워 고르기 등, M4-5). 타워 배치에 따라 쓰는 수가 달라지므로 세계 흐름과 나눈다 */
export const STREAM_BOSS = 'boss';
export const streamSummon = (player: number): string => `p${player}.summon`;
export const streamGamble = (player: number): string => `p${player}.gamble`;
/** 보스 카드 제시 (M4-7): 플레이어별 */
export const streamCards = (player: number): string => `p${player}.cards`;

/** 해시에 들어가는 확정 상태 (World.hashView). */
export interface WorldStateView {
  tick: number;
  seed: number;
  players: number;
  rng: Record<string, RngSnapshot>;
  nextId: number;
  entities: readonly Entity[];
  state: object;
}

/**
 * 틱 경계의 판 전체 (A-1 자동 저장·이어 하기): 해시 상태 + 아직 실행하지 않은 명령·다음 명령 번호 + 실행 기록.
 * JSON으로 바로 쓸 수 있는 읽기 전용 뷰다 (값을 복사하지 않음 — 쓰는 쪽이 곧바로 직렬화한다).
 */
export interface WorldCheckpoint extends WorldStateView {
  pending: readonly Command[];
  nextSeq: readonly number[];
  executed: readonly Command[];
}

export class World {
  readonly seed: number;
  readonly players: number;
  /** 지금까지 실행한 틱 수 = 다음에 실행할 틱 번호. */
  tick = 0;
  readonly entities = new EntityStore<Entity>();
  readonly queue: CommandQueue;
  /** 실행된 명령 기록 (리플레이 M3-12의 재료). 각 명령은 얼린 객체다. */
  readonly executed: Command[] = [];
  /** 판 상태 (해시에 들어감). WorldOptions.state 참고. */
  readonly state: object;

  private readonly rngRoot: Rng;
  private readonly streams = new Map<string, Rng>();
  private readonly systems: System[];
  private readonly handlers: Record<Command['type'], CommandHandler>;
  private events: SimEvent[] = [];
  private readonly maxEvents: number;
  private readonly listeners = new Map<string, EventListener[]>();
  /** 명령을 실행하기 전에 불리는 훅 (방치 미션의 '마지막 조작 틱' 등) */
  private beforeCommand: ((world: World, command: Command) => void) | null = null;

  constructor(options: WorldOptions) {
    if (!Number.isSafeInteger(options.seed)) throw new Error(`시드는 정수여야 한다 (받은 값: ${options.seed})`);
    const players = options.players ?? 1;
    if (!Number.isSafeInteger(players) || players < 1) throw new Error(`플레이어 수는 1 이상 정수 (받은 값: ${players})`);
    const maxPlayers = options.maxPlayers ?? players;
    if (!Number.isSafeInteger(maxPlayers) || maxPlayers < 1) {
      throw new Error(`최대 플레이어 수는 1 이상 정수 (받은 값: ${maxPlayers})`);
    }
    if (players > maxPlayers) throw new Error(`플레이어 수는 1~${maxPlayers} (받은 값: ${players})`);
    this.seed = options.seed >>> 0;
    this.players = players;
    this.queue = new CommandQueue(players);
    this.rngRoot = new Rng(this.seed);
    // 흐름은 처음에 모두 만든다 → 해시에 항상 같은 목록이 들어간다.
    this.streams.set(STREAM_WORLD, this.rngRoot.fork(STREAM_WORLD));
    this.streams.set(STREAM_COMBAT, this.rngRoot.fork(STREAM_COMBAT));
    this.streams.set(STREAM_BOSS, this.rngRoot.fork(STREAM_BOSS));
    for (let p = 0; p < players; p++) {
      this.streams.set(streamSummon(p), this.rngRoot.fork(streamSummon(p)));
      this.streams.set(streamGamble(p), this.rngRoot.fork(streamGamble(p)));
      this.streams.set(streamCards(p), this.rngRoot.fork(streamCards(p)));
    }
    this.systems = [...(options.systems ?? [])];
    this.state = options.state ?? {};
    this.maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
    if (!Number.isSafeInteger(this.maxEvents) || this.maxEvents < 1) throw new Error(`maxEvents는 1 이상 정수 (받은 값: ${this.maxEvents})`);
    // 처리기를 붙이지 않은 명령은 아무 일도 하지 않는다 (noop, 아직 시스템이 없는 명령)
    const nothing: CommandHandler = () => {};
    this.handlers = Object.fromEntries(COMMAND_TYPES.map((t) => [t, nothing])) as Record<CommandType, CommandHandler>;
  }

  /** 명령 처리기 붙이기 (판을 만드는 쪽이 시스템과 함께 등록). 같은 종류는 덮어쓴다. */
  setCommandHandler(type: CommandType, handler: CommandHandler): void {
    this.handlers[type] = handler;
  }

  /** 사건 구독 (sim 규칙용). 같은 종류에 여러 구독자를 붙일 수 있다 (등록 순서대로 불림). */
  on(type: string, listener: EventListener): void {
    const list = this.listeners.get(type);
    if (list) list.push(listener);
    else this.listeners.set(type, [listener]);
  }

  /** 명령마다 처리기보다 먼저 불릴 훅 (하나). */
  setBeforeCommand(hook: ((world: World, command: Command) => void) | null): void {
    this.beforeCommand = hook;
  }

  /** 이름으로 난수 흐름 가져오기. 없는 이름이면 에러 (오타 방지). */
  rng(name: string): Rng {
    const r = this.streams.get(name);
    if (!r) throw new Error(`없는 난수 흐름: ${name}`);
    return r;
  }

  /** 시스템 추가 (등록 순서대로 실행). */
  addSystem(system: System): void {
    this.systems.push(system);
  }

  /**
   * 명령 예약. tick을 생략하면 가장 이른 틱:
   * step 밖에서는 현재 틱(= 다음 step에서 실행), step 도중(시스템·처리기 안)에는 다음 틱.
   * 이미 꺼낸(실행 중인) 틱이나 지난 틱을 지정하면 거절한다 → 받아 놓고 실행하지 않는 명령이 생기지 않는다.
   * 멀티에서는 입력 지연을 위해 `tick: world.tick + 3`처럼 미래 틱을 지정한다.
   * 플레이어 번호는 0 ~ players-1만 받는다.
   */
  enqueue(input: CommandInput): EnqueueResult {
    return this.queue.enqueue(input, this.tick);
  }

  /** 1틱 진행. */
  step(): void {
    const commands = this.queue.take(this.tick);
    for (const cmd of commands) {
      this.beforeCommand?.(this, cmd);
      this.handlers[cmd.type](this, cmd);
      this.executed.push(cmd);
    }
    for (const system of this.systems) system(this);
    this.tick += 1;
  }

  /** n틱 진행. */
  stepN(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  /** 사건 알림 (시스템에서 호출). */
  emit(type: string, data: Record<string, string | number | boolean> = {}): void {
    const ev: SimEvent = { ...data, tick: this.tick, type };
    this.events.push(ev);
    // 한도의 2배가 되면 최근 한도만큼만 남긴다 (매번 자르지 않아서 평균 O(1))
    if (this.events.length >= this.maxEvents * 2) this.events = this.events.slice(-this.maxEvents);
    const list = this.listeners.get(type);
    if (list) for (const fn of list) fn(this, ev);
  }

  /** 쌓인 사건을 모두 가져가고 비운다 (화면용). */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** 지금까지 흐른 게임 시간 (ms). 표시용. */
  get elapsedMs(): number {
    return this.tick * TICK_MS;
  }

  /** 해시에 들어가는 상태 (대기 중인 명령은 빼고 확정된 상태만). */
  hashView(): WorldStateView {
    const rng: Record<string, RngSnapshot> = {};
    for (const [name, r] of this.streams) rng[name] = r.snapshot();
    return {
      tick: this.tick,
      seed: this.seed,
      players: this.players,
      rng,
      nextId: this.entities.nextId,
      entities: this.entities.list(),
      state: this.state,
    };
  }

  /** 틱 경계의 판 전체 (자동 저장용, A-1). step 도중에 부르면 에러 — 화면은 프레임 사이에서만 부른다. */
  checkpointView(): WorldCheckpoint {
    return {
      ...this.hashView(),
      pending: this.queue.pending(),
      nextSeq: Array.from({ length: this.players }, (_, p) => this.queue.peekNextSeq(p)),
      executed: this.executed,
    };
  }

  /**
   * 저장한 판 되살리기 (A-1): 같은 시작 입력(시드·인원·모드·덱 …)으로 막 만든 World에 확정 상태·난수·엔티티·다음 ID·
   * 대기 명령·실행 기록·틱을 넣는다. 이어서 같은 명령을 넣고 돌리면 끊기지 않은 판과 같은 해시가 나온다 (tests/integration/match-saves).
   * - optionalStateKeys: 판 상태에서 처음에는 없다가 생기는 필드 (MatchState의 chanceOv·sells — 해시에 빠져 있어야 예전 리플레이가 그대로).
   * - 모양이 다르면 에러를 던지고, 부르는 쪽(MatchSaves)이 저장을 버린다. 이 World는 그 뒤 쓰지 않는다.
   */
  restoreCheckpoint(saved: WorldCheckpoint, optionalStateKeys: readonly string[] = []): void {
    if (this.tick !== 0 || this.entities.size > 0 || this.queue.size > 0 || this.executed.length > 0) throw new Error('새로 만든 판에만 되살릴 수 있다');
    if (saved === null || typeof saved !== 'object') throw new Error('저장된 판이 객체가 아니다');
    if (saved.seed !== this.seed || saved.players !== this.players || !Number.isSafeInteger(saved.tick) || saved.tick < 0) {
      throw new Error('저장된 판의 시작 정보가 다르다');
    }
    const st = saved.state as Record<string, unknown> | null;
    if (st === null || typeof st !== 'object' || Array.isArray(st)) throw new Error('저장된 판 상태가 객체가 아니다');
    const fresh = this.state as Record<string, unknown>;
    for (const k of Object.keys(fresh)) {
      if (!Object.hasOwn(st, k)) throw new Error(`저장된 판 상태에 ${k}가 없다`);
      const a = fresh[k];
      const b = st[k];
      // 같은 모양인지 (배열·객체·원시 값 종류) — 다른 판 형식에서 온 저장을 걸러낸다
      if (Array.isArray(a) !== Array.isArray(b) || typeof a !== typeof b || (a === null) !== (b === null)) throw new Error(`저장된 판 상태 ${k}의 모양이 다르다`);
    }
    for (const k of Object.keys(st)) {
      if (!Object.hasOwn(fresh, k) && !optionalStateKeys.includes(k)) throw new Error(`저장된 판 상태에 모르는 필드 ${k}`);
    }
    const rng = saved.rng as Record<string, RngSnapshot> | null;
    if (rng === null || typeof rng !== 'object' || Object.keys(rng).length !== this.streams.size) throw new Error('저장된 난수 흐름 수가 다르다');
    const restored = new Map<string, Rng>();
    for (const [name, r] of this.streams) {
      const s = rng[name];
      if (!s || s.seed !== r.snapshot().seed || !Number.isSafeInteger(s.state) || s.state !== s.state >>> 0) throw new Error(`저장된 난수 흐름이 잘못됐다: ${name}`);
      restored.set(name, Rng.restore(s));
    }
    if (!Array.isArray(saved.entities)) throw new Error('저장된 엔티티가 배열이 아니다');
    let prevId = 0;
    for (const e of saved.entities) {
      if (e === null || typeof e !== 'object' || !Number.isSafeInteger(e.id) || e.id <= prevId || typeof e.kind !== 'string') throw new Error('저장된 엔티티가 잘못됐다');
      prevId = e.id;
    }
    if (!Array.isArray(saved.pending) || !Array.isArray(saved.nextSeq) || !Array.isArray(saved.executed)) throw new Error('저장된 명령 기록이 배열이 아니다');
    let prevExec: Command | null = null;
    for (const c of saved.executed) {
      const err = validateCommand(c, this.players);
      if (err) throw new Error(`저장된 실행 명령이 잘못됐다: ${err}`);
      if (c.tick >= saved.tick || (prevExec && c.tick < prevExec.tick)) throw new Error('저장된 실행 명령의 틱 순서가 잘못됐다');
      prevExec = c;
    }
    // 여기부터 실제로 넣는다 (위 검사를 모두 통과한 뒤)
    for (const [name, r] of restored) this.streams.set(name, r);
    for (const e of saved.entities) this.entities.insert(e);
    this.entities.restoreNextId(saved.nextId);
    this.queue.restore(saved.pending, saved.nextSeq, saved.tick);
    for (const c of saved.executed) {
      if (c.seq >= this.queue.peekNextSeq(c.player)) throw new Error('저장된 실행 명령 번호가 다음 번호보다 크다');
      this.executed.push(Object.freeze({ ...c }));
    }
    for (const k of optionalStateKeys) if (!Object.hasOwn(st, k)) delete fresh[k];
    Object.assign(fresh, st);
    this.tick = saved.tick;
  }

  /** 현재 상태 해시 (FNV-1a 32비트). */
  hash(): number {
    return hashValue(this.hashView());
  }
}

/**
 * 렌더 루프 → 고정 틱 변환기 (누적 시간 방식).
 *
 * 프레임마다 `advance(deltaMs)`를 부르면 이번 프레임에 돌릴 틱 수를 돌려준다.
 * - 배속 ×2면 같은 시간에 틱이 2배.
 * - 배속 0이면 일시정지.
 * - 탭 전환 등으로 한 프레임이 너무 길면 `maxFrameMs`까지만 따라잡는다 (나머지는 버림).
 *   자르기는 배속을 곱하기 **전** 실제 시간에 건다 → ×16이면 한 프레임에 게임 시간 maxFrameMs × 16까지 (T-1).
 *   느린 기기에서 한 프레임 틱 수를 더 줄이는 것은 화면 쪽 `src/view/tickBudget.ts`.
 * - `alpha`(0~1)는 다음 틱까지 남은 비율 → 렌더 보간용.
 * 이 클래스는 화면 쪽 시간을 받기만 하고 sim 상태에는 영향을 주지 않는다 (몇 번 step할지만 정함).
 */
export class TickClock {
  /** 남은 시간 (ms × 배속). 화면 쪽 값이라 소수여도 sim 결정성에 영향이 없다. */
  private accMs = 0;
  private speedValue: number;
  readonly maxFrameMs: number;

  constructor(options: { speed?: number; maxFrameMs?: number } = {}) {
    this.speedValue = options.speed ?? 1;
    this.maxFrameMs = options.maxFrameMs ?? 250;
    this.checkSpeed(this.speedValue);
  }

  private checkSpeed(s: number): void {
    if (!Number.isInteger(s) || s < 0 || s > 16) throw new Error(`배속은 0~16 정수 (받은 값: ${s})`);
  }

  get speed(): number {
    return this.speedValue;
  }

  set speed(s: number) {
    this.checkSpeed(s);
    this.speedValue = s;
  }

  /** 흐른 실제 시간(ms)을 넣으면 이번에 실행할 틱 수를 돌려준다. */
  advance(deltaMs: number): number {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || this.speedValue === 0) return 0;
    const clamped = deltaMs > this.maxFrameMs ? this.maxFrameMs : deltaMs;
    this.accMs += clamped * this.speedValue;
    // 1000/30 같은 값을 더할 때 생기는 아주 작은 부동소수 오차로 틱 하나를 놓치지 않게 여유(EPS)를 둔다.
    const ticks = Math.floor(this.accMs / TICK_MS + TickClock.EPS);
    this.accMs -= ticks * TICK_MS;
    if (this.accMs < 0) this.accMs = 0;
    return ticks;
  }

  private static readonly EPS = 1e-6;

  /** 다음 틱까지 진행 비율 (0 이상 1 미만). */
  get alpha(): number {
    const a = this.accMs / TICK_MS;
    return a < 1 ? a : 0.999999;
  }

  reset(): void {
    this.accMs = 0;
  }
}
