/**
 * 명령(Command)과 틱 예약 큐.
 *
 * - 플레이어의 모든 행동은 Command 객체로 만들어 `world.enqueue()` 한다. UI는 상태를 직접 바꾸지 않는다.
 * - 명령은 `tick`에 실행된다. 같은 틱 안에서는 (플레이어 번호, 명령 번호 seq) 순서 (MULTIPLAYER.md 4.1).
 * - seq는 플레이어마다 따로 매긴다. 비워 두면 큐가 다음 번호를 붙인다.
 *
 * 마일스톤마다 명령 종류가 늘어난다 (M2 소환, M3 승급·이동, M5 강화·도박·도전 …).
 * 새 명령은 `CommandPayload` 합집합에 추가하고 `COMMAND_TYPES`와 `validatePayload`, World의 처리기를 함께 갱신한다.
 */

/** 동시에 참여할 수 있는 최대 플레이어 수 (멀티 2인 + 여유). */
export const MAX_PLAYERS = 4;

/** 명령 내용 (종류별). */
export type CommandPayload =
  /** 빈 명령: 락스텝에서 "이 틱엔 할 일 없음"을 알리는 용도 (M13). 상태를 바꾸지 않는다. */
  { type: 'noop' };

export type CommandType = CommandPayload['type'];

export const COMMAND_TYPES: readonly CommandType[] = ['noop'];

/** 큐에 들어간(확정된) 명령. */
export type Command = CommandPayload & {
  /** 실행할 틱 번호 */
  tick: number;
  /** 플레이어 번호 (0부터) */
  player: number;
  /** 플레이어별 명령 번호 (0부터 증가) */
  seq: number;
};

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
  if (typeof cmd !== 'object' || cmd === null) return '명령이 객체가 아님';
  const type = (cmd as { type?: unknown }).type;
  if (typeof type !== 'string' || !(COMMAND_TYPES as readonly string[]).includes(type)) {
    return `알 수 없는 명령 종류: ${String(type)}`;
  }
  switch (type as CommandType) {
    case 'noop':
      return null;
  }
}

/** 확정 명령 전체 검사 (tick·player·seq 포함). */
export function validateCommand(cmd: unknown): string | null {
  const payloadError = validatePayload(cmd);
  if (payloadError) return payloadError;
  const c = cmd as Partial<Command>;
  if (!isNonNegInt(c.tick)) return `tick이 0 이상 정수가 아님: ${String(c.tick)}`;
  if (!isNonNegInt(c.player) || c.player >= MAX_PLAYERS) return `player가 0~${MAX_PLAYERS - 1}이 아님: ${String(c.player)}`;
  if (!isNonNegInt(c.seq)) return `seq가 0 이상 정수가 아님: ${String(c.seq)}`;
  return null;
}

/** 틱별 명령 예약 큐. */
export class CommandQueue {
  private readonly byTick = new Map<number, Command[]>();
  private readonly nextSeq: number[] = new Array<number>(MAX_PLAYERS).fill(0);
  private readonly pendingKeys = new Set<string>();

  /**
   * 명령 예약. `currentTick`보다 이른 틱은 거절한다 (이미 지난 틱은 바꿀 수 없음).
   * tick 생략 시 currentTick, player 생략 시 0, seq 생략 시 그 플레이어의 다음 번호.
   */
  enqueue(input: CommandInput, currentTick: number): EnqueueResult {
    const player = input.player ?? 0;
    const tick = input.tick ?? currentTick;
    const seq = input.seq ?? this.nextSeq[player] ?? 0;
    const command = { ...input, tick, player, seq } as Command;

    const error = validateCommand(command);
    if (error) return { ok: false, reason: error };
    if (tick < currentTick) return { ok: false, reason: `지난 틱의 명령 (명령 틱 ${tick} < 현재 틱 ${currentTick})` };

    const key = `${player}:${seq}`;
    if (this.pendingKeys.has(key)) return { ok: false, reason: `중복 명령 번호 (플레이어 ${player}, seq ${seq})` };

    this.pendingKeys.add(key);
    this.nextSeq[player] = Math.max(this.nextSeq[player] ?? 0, seq + 1);
    const list = this.byTick.get(tick);
    if (list) list.push(command);
    else this.byTick.set(tick, [command]);
    return { ok: true, command };
  }

  /** 그 틱의 명령을 실행 순서대로 꺼낸다 (큐에서 빠짐). */
  take(tick: number): Command[] {
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
}
