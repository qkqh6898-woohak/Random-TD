/**
 * World: 판 전체의 결정적 상태 + 고정 틱 진행.
 *
 * - 로직은 초당 20틱(1틱 = 50ms) 고정 (CLAUDE.md 2장 4번). 시간은 틱 번호로만 센다.
 * - `step()` 1회 = 1틱: ① 이 틱에 예약된 명령을 (플레이어, seq) 순으로 실행 ② 시스템을 등록 순서대로 실행 ③ tick + 1.
 * - 렌더 루프와는 `TickClock`(누적 시간 방식)으로 분리한다. 화면은 프레임마다 흐른 시간을 넘기고,
 *   TickClock이 돌려준 수만큼 `step()`을 부른다. 배속은 한 프레임에 여러 틱을 돌리는 것으로 구현한다.
 * - Phaser·DOM·window를 모른다. 화면은 상태를 읽기만 하고, 바꾸려면 `enqueue()`로 명령을 넣는다.
 */

import { CommandQueue, type Command, type CommandInput, type EnqueueResult } from './Commands';
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

export interface WorldOptions {
  /** 판 시드 (32비트 정수) */
  seed: number;
  /** 플레이어 수 (1~2, 기본 1) */
  players?: number;
  /** 틱마다 돌릴 시스템 (기본 없음) */
  systems?: System[];
}

/** 난수 흐름 이름. 흐름끼리 독립이다 (MULTIPLAYER.md 4.2). */
export const STREAM_WORLD = 'world';
export const streamSummon = (player: number): string => `p${player}.summon`;
export const streamGamble = (player: number): string => `p${player}.gamble`;

export class World {
  readonly seed: number;
  readonly players: number;
  /** 지금까지 실행한 틱 수 = 다음에 실행할 틱 번호. */
  tick = 0;
  readonly entities = new EntityStore<Entity>();
  readonly queue = new CommandQueue();
  /** 실행된 명령 기록 (리플레이 M3-12의 재료). */
  readonly executed: Command[] = [];

  private readonly rngRoot: Rng;
  private readonly streams = new Map<string, Rng>();
  private readonly systems: System[];
  private readonly handlers: Record<Command['type'], CommandHandler>;
  private events: SimEvent[] = [];

  constructor(options: WorldOptions) {
    if (!Number.isSafeInteger(options.seed)) throw new Error(`시드는 정수여야 한다 (받은 값: ${options.seed})`);
    const players = options.players ?? 1;
    if (!Number.isInteger(players) || players < 1 || players > 2) {
      throw new Error(`플레이어 수는 1~2 (받은 값: ${players})`);
    }
    this.seed = options.seed >>> 0;
    this.players = players;
    this.rngRoot = new Rng(this.seed);
    // 흐름은 처음에 모두 만든다 → 해시에 항상 같은 목록이 들어간다.
    this.streams.set(STREAM_WORLD, this.rngRoot.fork(STREAM_WORLD));
    for (let p = 0; p < players; p++) {
      this.streams.set(streamSummon(p), this.rngRoot.fork(streamSummon(p)));
      this.streams.set(streamGamble(p), this.rngRoot.fork(streamGamble(p)));
    }
    this.systems = [...(options.systems ?? [])];
    this.handlers = {
      noop: () => {},
    };
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
   * 명령 예약. tick을 생략하면 현재 틱(= 다음 step에서 실행).
   * 멀티에서는 입력 지연을 위해 `tick: world.tick + 3`처럼 미래 틱을 지정한다.
   */
  enqueue(input: CommandInput): EnqueueResult {
    if (input.player !== undefined && input.player >= this.players) {
      return { ok: false, reason: `없는 플레이어: ${input.player}` };
    }
    return this.queue.enqueue(input, this.tick);
  }

  /** 1틱 진행. */
  step(): void {
    const commands = this.queue.take(this.tick);
    for (const cmd of commands) {
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
    this.events.push({ ...data, tick: this.tick, type });
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
  hashView(): unknown {
    const rng: Record<string, RngSnapshot> = {};
    for (const [name, r] of this.streams) rng[name] = r.snapshot();
    return {
      tick: this.tick,
      seed: this.seed,
      players: this.players,
      rng,
      nextId: this.entities.nextId,
      entities: this.entities.list(),
    };
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
