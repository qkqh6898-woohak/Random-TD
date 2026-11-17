/**
 * 명령(Command)과 틱 예약 큐.
 *
 * - 플레이어의 모든 행동은 Command 객체로 만들어 `world.enqueue()` 한다. UI는 상태를 직접 바꾸지 않는다.
 * - 명령은 `tick`에 실행된다. 같은 틱 안에서는 (플레이어 번호, 명령 번호 seq) 순서 (MULTIPLAYER.md 4.1).
 * - seq는 플레이어마다 따로 매긴다. 비워 두면 큐가 다음 번호를 붙인다.
 *
 * 마일스톤마다 명령 종류가 늘어난다 (M2 소환, M3 승급·모두 승급·이동·들어 올리기·개발용 타워 놓기, M4 일꾼·카드·승급의 축복,
 * M5 강화·도박·도전 …, T-2 판매·개발자 변환·개발자 확률 조정, F10 준비 완료).
 * 새 명령은 `CommandPayload` 합집합에 추가하고 `COMMAND_TYPES`·`PAYLOAD_FIELDS`·`validatePayload`, World의 처리기를 함께 갱신한다.
 * - 큐에 들어가는 명령은 허용한 필드만 골라 새로 만든 **얼린(frozen) 객체**다. 호출자가 넘긴 객체나 돌려받은 객체를
 *   고쳐도 예약·실행·기록(executed)이 바뀌지 않는다. 모르는 필드는 거절한다 (네트워크로 받은 명령이 아무 내용이나 싣지 못하게).
 * - 최대 플레이어 수는 큐를 만들 때 받는다 (World의 플레이어 수 = game.json maxPlayers 이하). 코드에 따로 박지 않는다.
 */

/** 명령 내용 (종류별). */
export type CommandPayload =
  /** 빈 명령: 락스텝에서 "이 틱엔 할 일 없음"을 알리는 용도 (M13). 상태를 바꾸지 않는다. */
  | { type: 'noop' }
  /** 개발용 치트 (?debug=1, CLAUDE.md 4장): 다음 단계로 바로 넘어간다. debug 판에서만 듣고, 쓰면 판 상태에 표시된다. */
  | { type: 'debugSkipStage' }
  /** 소환 (M2-1, GDD 4.3): 빈 배치 칸 (x, y)에 소환 비용을 내고 덱 노말 5종 중 하나를 놓는다. 실행 때 다시 검사한다 */
  | { type: 'summon'; x: number; y: number }
  /** 개발용 치트: 돈 추가 (debug 판에서만) */
  | { type: 'debugAddGold'; amount: number }
  /** 승급 (M3-1, GDD 4.4): 칸 (x, y)의 타워와 같은 종류 3개 → 그 칸에 덱의 다음 등급 하나. 사라지는 2개 = 가장 나중에 소환된 2개 */
  | { type: 'merge'; x: number; y: number }
  /** 모두 승급 (M3-2): 칸 (x, y)의 타워와 같은 종류를 가능한 만큼 연속 승급 (7개 → 2회) */
  | { type: 'mergeAll'; x: number; y: number }
  /** 이동·교환 (M3-10, GDD 4.5): 칸 (fx, fy)의 타워를 빈 배치 칸 (tx, ty)로 옮기거나 그 칸의 타워와 자리를 바꾼다 */
  | { type: 'move'; fx: number; fy: number; tx: number; ty: number }
  /**
   * 들어 올리기 (M3-10, GDD 4.5 '이동 중인 타워는 공격하지 않음'): 칸 (x, y)의 내 타워를 길게 눌러 끄는 동안(on = 1) 공격하지 않는다.
   * 놓으면 on = 0 (옮겼으면 move가 이어서 0.5초 정지를 건다)
   */
  | { type: 'hold'; x: number; y: number; on: number }
  /**
   * 개발용 치트 (?debug=1, M3b): 빈 배치 칸 (x, y)에 towers.json 순서 t번째 타워를 돈 없이 바로 놓는다 (특색 확인·E2E·리플레이용).
   * debug 판에서만 듣고, 쓰면 판 상태에 표시된다.
   */
  | { type: 'debugTower'; x: number; y: number; t: number }
  /** 일꾼 고용 (M4-1, GDD 3장): 300원에 일꾼 1명 (최대 10명). 실행 때 다시 검사한다 */
  | { type: 'hireWorker' }
  /** 보스 카드 고르기 (M4-7, GDD 3.1): 가장 먼저 받은 카드 묶음에서 i번째 (0부터) */
  | { type: 'pickCard'; i: number }
  /** 승급의 축복 (M4-7): 결과 타워 id를 다른 결과로 바꿀지 (pick 1 = 바꿈, 0 = 그대로) */
  | { type: 'pickMerge'; id: number; pick: number }
  /** 개발용 치트 (?debug=1, M4): cards.json 순서 c번째 카드 효과를 바로 적용 (카드 UI·효과 확인용). debug 판에서만 */
  | { type: 'debugCard'; c: number }
  /** 판 내 강화 (M5-3, GDD 7.1): rules.upgrades의 k번째 (등급 강화 → 능력치 강화 → 초월)를 한 레벨. 길게 누르면 화면이 여러 번 보낸다 */
  | { type: 'upgrade'; k: number }
  /** 도박 (M5-5, GDD 7.2): game.json gamble.tables의 t번째 테이블 (0 = 10원 …) */
  | { type: 'gamble'; t: number }
  /** 도전 시작 (M5-2, GDD 6장): lv단계 (1부터) */
  | { type: 'startChallenge'; lv: number }
  /** 미션 보상 받기 (M5-6, GDD 8장): missions.json 순서 i번째 (0부터) */
  | { type: 'claimMission'; i: number }
  /** 미션 보상 모두 받기 (M5-6) */
  | { type: 'claimAllMissions' }
  /** 타워 판매 (T-2): 칸 (x, y)의 내 타워를 가치의 50%에 판다 (game.json sell) */
  | { type: 'sellTower'; x: number; y: number }
  /** 개발용 (T-2, 개발자 판만): 칸 (x, y)의 내 타워를 towers.json 순서 t번째(같은 등급의 다른 타워)로 그 자리에서 바꾼다 */
  | { type: 'debugConvertTower'; x: number; y: number; t: number }
  /**
   * 개발용 (T-2, 개발자 판만): 확률 조정 — key(game.json devChances 이름, 'all' = 모두)를 bp로 (0~10000, stepBp 단위). bp −1 = 기본값으로
   */
  | { type: 'debugSetChance'; key: string; bp: number }
  /**
   * 준비 완료 (F10, 첫 10단계 개선): 준비 단계(0단계)에서만 — 1단계를 이 틱에 바로 시작한다 (남은 준비 시간을 건너뜀).
   * 그 뒤 단계는 여기서부터 60초마다. 준비 단계가 아니면 무시 (연타해도 1단계는 한 번).
   */
  | { type: 'readyNow' }
  // ---- G-1 (새 명령만 더한다 — 예전 summon·merge·move는 뜻 그대로라 예전 리플레이가 같게 돈다) ----
  /** 무더기 소환 (G-1 칸 쌓기): 같은 타워의 덜 찬 내 칸 → 누른 빈 칸 (x, y) → 자동 빈 칸 순으로 놓는다. 일반 소환 천장 포함 */
  | { type: 'summonPad'; x: number; y: number }
  /** 무더기 소환 — 자동 칸 ([🎲 소환] 버튼·꾹 눌러 연속 소환) */
  | { type: 'summonAuto' }
  /** 연쇄 승급 (G-1): 칸 (x, y)의 가득 찬 무더기를 승급하고 이어서 할 수 있는 만큼 (merge.chainMax까지) */
  | { type: 'mergeStack'; x: number; y: number }
  /** 무더기 이동·교환·합치기 (G-1): 칸 (fx, fy)의 무더기를 (tx, ty)로 */
  | { type: 'moveStack'; fx: number; fy: number; tx: number; ty: number }
  /** 소환 도박 (G-1): game.json summonGamble.kinds의 k번째, f = 종족 번호 (종족 소환만, 나머지는 0) */
  | { type: 'gacha'; k: number; f: number }
  /** 신화 조합 (G-1 도감): rules.recipes의 r번째 (towers.json의 히든 타워 순서) */
  | { type: 'craft'; r: number }
  /** 필살기 (G-1): 내 타워 엔티티 id의 게이지가 가득이면 발동 */
  | { type: 'ult'; id: number };

export type CommandType = CommandPayload['type'];

export const COMMAND_TYPES: readonly CommandType[] = [
  'noop',
  'debugSkipStage',
  'summon',
  'debugAddGold',
  'merge',
  'mergeAll',
  'move',
  'hold',
  'debugTower',
  'hireWorker',
  'pickCard',
  'pickMerge',
  'debugCard',
  'upgrade',
  'gamble',
  'startChallenge',
  'claimMission',
  'claimAllMissions',
  'sellTower',
  'debugConvertTower',
  'debugSetChance',
  'readyNow',
  'summonPad',
  'summonAuto',
  'mergeStack',
  'moveStack',
  'gacha',
  'craft',
  'ult',
];

/** 칸 좌표 상한 (맵은 이보다 훨씬 작다. 네트워크로 받은 터무니없는 값을 거른다) */
export const MAX_TILE_COORD = 255;
/** 개발용 돈 추가 한 번의 상한 */
export const MAX_DEBUG_GOLD = 1_000_000_000;

/** 종류별 내용 필드 (type·tick·player·seq 제외). 여기 없는 필드는 거절한다. */
export const PAYLOAD_FIELDS: { readonly [K in CommandType]: readonly string[] } = {
  noop: [],
  debugSkipStage: [],
  summon: ['x', 'y'],
  debugAddGold: ['amount'],
  merge: ['x', 'y'],
  mergeAll: ['x', 'y'],
  move: ['fx', 'fy', 'tx', 'ty'],
  hold: ['x', 'y', 'on'],
  debugTower: ['x', 'y', 't'],
  hireWorker: [],
  pickCard: ['i'],
  pickMerge: ['id', 'pick'],
  debugCard: ['c'],
  upgrade: ['k'],
  gamble: ['t'],
  startChallenge: ['lv'],
  claimMission: ['i'],
  claimAllMissions: [],
  sellTower: ['x', 'y'],
  debugConvertTower: ['x', 'y', 't'],
  debugSetChance: ['key', 'bp'],
  readyNow: [],
  summonPad: ['x', 'y'],
  summonAuto: [],
  mergeStack: ['x', 'y'],
  moveStack: ['fx', 'fy', 'tx', 'ty'],
  gacha: ['k', 'f'],
  craft: ['r'],
  ult: ['id'],
};

/** 확률 조정 key 글자 한도 (데이터 이름보다 넉넉히, 네트워크로 받은 터무니없는 값을 거른다) */
export const MAX_CHANCE_KEY_LENGTH = 32;

/** 카드 번호 상한 (한 번에 보여주는 카드는 6장 이하) */
export const MAX_CARD_INDEX = 9;
/** 강화·도박 테이블·도전 단계·미션 번호 상한 (데이터보다 넉넉히, 네트워크로 받은 터무니없는 값을 거른다) */
export const MAX_UPGRADE_INDEX = 63;
export const MAX_GAMBLE_TABLE = 9;
export const MAX_CHALLENGE_LEVEL = 99;
export const MAX_MISSION_INDEX = 255;

/** 모든 명령에 공통인 필드. */
const ENVELOPE_FIELDS: readonly string[] = ['type', 'tick', 'player', 'seq'];

/** 큐에 들어간(확정된) 명령. 얼린 객체라 고칠 수 없다. */
export type Command = Readonly<
  CommandPayload & {
    /** 실행할 틱 번호 */
    tick: number;
    /** 플레이어 번호 (0부터) */
    player: number;
    /** 플레이어별 명령 번호 (0부터 증가) */
    seq: number;
  }
>;

/** enqueue에 넘기는 명령. tick/player/seq는 생략 가능 (World가 채운다). */
export type CommandInput = CommandPayload & {
  tick?: number;
  player?: number;
  seq?: number;
};

export type EnqueueResult = { ok: true; command: Command } | { ok: false; reason: string };

/** 실행 순서: 틱 → 플레이어 → seq. */
export function compareCommands(a: Command, b: Command): number {
  return a.tick - b.tick || a.player - b.player || a.seq - b.seq;
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

/** 명령 내용 검사. 문제가 있으면 이유(한국어), 없으면 null. 네트워크로 받은 명령도 이걸로 거른다. */
export function validatePayload(cmd: unknown): string | null {
  if (typeof cmd !== 'object' || cmd === null || Array.isArray(cmd)) return '명령이 객체가 아님';
  const type = (cmd as { type?: unknown }).type;
  if (typeof type !== 'string' || !(COMMAND_TYPES as readonly string[]).includes(type)) {
    return `알 수 없는 명령 종류: ${String(type)}`;
  }
  const allowed = PAYLOAD_FIELDS[type as CommandType];
  for (const key of Object.keys(cmd)) {
    if (!ENVELOPE_FIELDS.includes(key) && !allowed.includes(key)) return `모르는 필드: ${key} (${type} 명령)`;
  }
  const c = cmd as Record<string, unknown>;
  switch (type as CommandType) {
    case 'noop':
    case 'debugSkipStage':
    case 'hireWorker':
    case 'claimAllMissions':
    case 'readyNow':
    case 'summonAuto':
      return null;
    case 'gacha':
      if (!isNonNegInt(c.k) || c.k > MAX_GAMBLE_TABLE) return `k가 0~${MAX_GAMBLE_TABLE} 정수가 아님: ${String(c.k)} (gacha 명령)`;
      if (!isNonNegInt(c.f) || c.f > MAX_GAMBLE_TABLE) return `f가 0~${MAX_GAMBLE_TABLE} 정수가 아님: ${String(c.f)} (gacha 명령)`;
      return null;
    case 'craft':
      if (!isNonNegInt(c.r) || c.r > MAX_MISSION_INDEX) return `r이 0~${MAX_MISSION_INDEX} 정수가 아님: ${String(c.r)} (craft 명령)`;
      return null;
    case 'ult':
      if (!isNonNegInt(c.id) || c.id < 1) return `id가 1 이상 정수가 아님: ${String(c.id)} (ult 명령)`;
      return null;
    case 'upgrade':
      if (!isNonNegInt(c.k) || c.k > MAX_UPGRADE_INDEX) return `k가 0~${MAX_UPGRADE_INDEX} 정수가 아님: ${String(c.k)} (upgrade 명령)`;
      return null;
    case 'gamble':
      if (!isNonNegInt(c.t) || c.t > MAX_GAMBLE_TABLE) return `t가 0~${MAX_GAMBLE_TABLE} 정수가 아님: ${String(c.t)} (gamble 명령)`;
      return null;
    case 'startChallenge':
      if (!isNonNegInt(c.lv) || c.lv < 1 || c.lv > MAX_CHALLENGE_LEVEL) return `lv가 1~${MAX_CHALLENGE_LEVEL} 정수가 아님: ${String(c.lv)} (startChallenge 명령)`;
      return null;
    case 'claimMission':
      if (!isNonNegInt(c.i) || c.i > MAX_MISSION_INDEX) return `i가 0~${MAX_MISSION_INDEX} 정수가 아님: ${String(c.i)} (claimMission 명령)`;
      return null;
    case 'pickCard': {
      const v = c.i;
      if (!isNonNegInt(v) || v > MAX_CARD_INDEX) return `i가 0~${MAX_CARD_INDEX} 정수가 아님: ${String(v)} (pickCard 명령)`;
      return null;
    }
    case 'debugCard':
      if (!isNonNegInt(c.c) || c.c > 255) return `c가 0~255 정수가 아님: ${String(c.c)} (debugCard 명령)`;
      return null;
    case 'pickMerge':
      if (!isNonNegInt(c.id) || c.id < 1) return `id가 1 이상 정수가 아님: ${String(c.id)} (pickMerge 명령)`;
      if (c.pick !== 0 && c.pick !== 1) return `pick이 0 또는 1이 아님: ${String(c.pick)} (pickMerge 명령)`;
      return null;
    case 'debugSetChance': {
      const key = c.key;
      if (typeof key !== 'string' || key.length < 1 || key.length > MAX_CHANCE_KEY_LENGTH || !/^[A-Za-z0-9:._-]+$/.test(key)) {
        return `key가 1~${MAX_CHANCE_KEY_LENGTH}자 영문·숫자 이름이 아님: ${String(key)} (debugSetChance 명령)`;
      }
      const v = c.bp;
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < -1 || v > 10000) return `bp가 -1~10000 정수가 아님: ${String(v)} (debugSetChance 명령)`;
      return null;
    }
    case 'summon':
    case 'merge':
    case 'mergeAll':
    case 'move':
    case 'sellTower':
    case 'summonPad':
    case 'mergeStack':
    case 'moveStack':
      for (const k of PAYLOAD_FIELDS[type as CommandType]) {
        const v = c[k];
        if (!isNonNegInt(v) || v > MAX_TILE_COORD) return `${k}가 0~${MAX_TILE_COORD} 정수가 아님: ${String(v)} (${type} 명령)`;
      }
      return null;
    case 'hold':
      for (const k of ['x', 'y']) {
        const v = c[k];
        if (!isNonNegInt(v) || v > MAX_TILE_COORD) return `${k}가 0~${MAX_TILE_COORD} 정수가 아님: ${String(v)} (hold 명령)`;
      }
      if (c.on !== 0 && c.on !== 1) return `on이 0 또는 1이 아님: ${String(c.on)} (hold 명령)`;
      return null;
    case 'debugTower':
    case 'debugConvertTower':
      for (const k of ['x', 'y', 't']) {
        const v = c[k];
        if (!isNonNegInt(v) || v > MAX_TILE_COORD) return `${k}가 0~${MAX_TILE_COORD} 정수가 아님: ${String(v)} (${type} 명령)`;
      }
      return null;
    case 'debugAddGold': {
      const v = c.amount;
      if (!isNonNegInt(v) || v < 1 || v > MAX_DEBUG_GOLD) return `amount가 1~${MAX_DEBUG_GOLD} 정수가 아님: ${String(v)} (debugAddGold 명령)`;
      return null;
    }
  }
}

/**
 * 확정 명령 전체 검사 (tick·player·seq 포함).
 * @param players 이 판의 플레이어 수 (player는 0 ~ players-1)
 */
export function validateCommand(cmd: unknown, players: number): string | null {
  const payloadError = validatePayload(cmd);
  if (payloadError) return payloadError;
  const c = cmd as Partial<Command>;
  if (!isNonNegInt(c.tick)) return `tick이 0 이상 정수가 아님: ${String(c.tick)}`;
  if (!isNonNegInt(c.player) || c.player >= players) return `player가 0~${players - 1}이 아님: ${String(c.player)}`;
  if (!isNonNegInt(c.seq)) return `seq가 0 이상 정수가 아님: ${String(c.seq)}`;
  return null;
}

/** JSON 값 깊은 복사 + 얼리기 (명령 내용 필드용). */
function frozenCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((v: unknown) => frozenCopy(v))) as T;
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = frozenCopy(v);
    return Object.freeze(out) as T;
  }
  return value;
}

/** 허용한 필드만 골라 새 명령 객체를 만들고 얼린다 (validatePayload를 통과한 입력에만 쓴다). */
function buildCommand(input: CommandInput, tick: number, player: number, seq: number): Command {
  const out: Record<string, unknown> = { type: input.type, tick, player, seq };
  const source = input as unknown as Record<string, unknown>;
  for (const field of PAYLOAD_FIELDS[input.type]) out[field] = frozenCopy(source[field]);
  return Object.freeze(out) as Command;
}

/** 틱별 명령 예약 큐. */
export class CommandQueue {
  /** 이 판의 플레이어 수 (player는 0 ~ players-1). */
  readonly players: number;
  private readonly byTick = new Map<number, Command[]>();
  private readonly nextSeq: number[];
  private readonly pendingKeys = new Set<string>();
  /**
   * 이 틱보다 이른 틱은 이미 take했다(닫혔다). step 도중(시스템·명령 처리기 안)에 들어온 명령이
   * 이미 꺼낸 틱에 들어가 영원히 실행되지 않는 일을 막는다.
   */
  private openFrom = 0;

  constructor(players: number) {
    if (!Number.isSafeInteger(players) || players < 1) throw new Error(`플레이어 수는 1 이상 정수 (받은 값: ${players})`);
    this.players = players;
    this.nextSeq = new Array<number>(players).fill(0);
  }

  /** 지금 예약할 수 있는 가장 이른 틱: currentTick과 '아직 꺼내지 않은 첫 틱' 중 큰 값. */
  earliestTick(currentTick: number): number {
    return Math.max(currentTick, this.openFrom);
  }

  /**
   * 명령 예약. 받을 수 있는 가장 이른 틱(`earliestTick`)보다 이른 틱은 거절한다
   * (이미 지난 틱, 또는 지금 실행 중이라 이미 꺼낸 틱은 바꿀 수 없음).
   * tick 생략 시 가장 이른 틱, player 생략 시 0, seq 생략 시 그 플레이어의 다음 번호.
   * 돌려주는 command는 큐 안의 것과 같은 얼린 객체다.
   */
  enqueue(input: CommandInput, currentTick: number): EnqueueResult {
    const payloadError = validatePayload(input);
    if (payloadError) return { ok: false, reason: payloadError };

    const earliest = this.earliestTick(currentTick);
    const player = input.player ?? 0;
    const tick = input.tick ?? earliest;
    const seq = input.seq ?? this.nextSeq[player] ?? 0;

    const error = validateCommand({ ...input, tick, player, seq }, this.players);
    if (error) return { ok: false, reason: error };
    if (tick < currentTick) return { ok: false, reason: `지난 틱의 명령 (명령 틱 ${tick} < 현재 틱 ${currentTick})` };
    if (tick < earliest) {
      return { ok: false, reason: `이미 실행 중인 틱의 명령 (명령 틱 ${tick}, 가장 이른 예약 가능 틱 ${earliest})` };
    }

    const key = `${player}:${seq}`;
    if (this.pendingKeys.has(key)) return { ok: false, reason: `중복 명령 번호 (플레이어 ${player}, seq ${seq})` };

    const command = buildCommand(input, tick, player, seq);
    this.pendingKeys.add(key);
    this.nextSeq[player] = Math.max(this.nextSeq[player] ?? 0, seq + 1);
    const list = this.byTick.get(tick);
    if (list) list.push(command);
    else this.byTick.set(tick, [command]);
    return { ok: true, command };
  }

  /** 그 틱의 명령을 실행 순서대로 꺼낸다 (큐에서 빠짐). 그 틱까지는 닫혀서 더 예약할 수 없다. */
  take(tick: number): Command[] {
    if (tick + 1 > this.openFrom) this.openFrom = tick + 1;
    const list = this.byTick.get(tick);
    if (!list) return [];
    this.byTick.delete(tick);
    for (const c of list) this.pendingKeys.delete(`${c.player}:${c.seq}`);
    return list.sort(compareCommands);
  }

  /** 대기 중인 명령 전체 (실행 순서). 스냅샷·디버그용. */
  pending(): Command[] {
    const all: Command[] = [];
    for (const list of this.byTick.values()) all.push(...list);
    return all.sort(compareCommands);
  }

  get size(): number {
    return this.pendingKeys.size;
  }

  /** 다음에 붙일 seq (플레이어별). */
  peekNextSeq(player: number): number {
    return this.nextSeq[player] ?? 0;
  }

  /**
   * 저장 복원용 (A-1): 빈 큐에 저장된 대기 명령을 원래 틱·플레이어·seq 그대로 다시 넣고, 다음 명령 번호와
   * '꺼낸 틱' 경계(tick = 다음에 실행할 틱)를 맞춘다. 명령이 잘못됐거나 번호가 거꾸로면 에러.
   */
  restore(pending: readonly Command[], nextSeq: readonly number[], tick: number): void {
    if (this.size !== 0 || nextSeq.length !== this.players || nextSeq.some((seq) => !isNonNegInt(seq))) {
      throw new Error('저장된 명령 큐가 잘못됐다');
    }
    for (const cmd of pending) {
      const err = validateCommand(cmd, this.players);
      if (err) throw new Error(`저장된 대기 명령이 잘못됐다: ${err}`);
      const result = this.enqueue(cmd as unknown as CommandInput, tick);
      if (!result.ok) throw new Error(`저장된 대기 명령을 넣을 수 없다: ${result.reason}`);
    }
    for (let p = 0; p < this.players; p++) {
      const seq = nextSeq[p] as number;
      if (seq < (this.nextSeq[p] ?? 0)) throw new Error('저장된 다음 명령 번호가 대기 명령보다 작다');
      this.nextSeq[p] = seq;
    }
    this.openFrom = tick;
  }
}
