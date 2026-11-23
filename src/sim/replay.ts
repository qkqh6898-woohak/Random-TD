/**
 * 리플레이 (DEV_PLAN M3-12, MULTIPLAYER.md 6장): 시드 + 판 시작 입력(모드·테마·인원·덱·타워 레벨·계정 레벨·debug) + 실행된 명령 기록 → 판 전체 재생.
 *
 * - 결정성 자동 검사: 저장한 리플레이를 다시 돌려 끝 해시(World.hash)가 같으면 sim이 같은 결과를 낸다.
 *   주기 해시(checkpoints, 기본 200틱마다)도 저장해 어긋나면 **처음 어긋난 틱**을 알려 준다 (버그 재현 도구).
 * - 명령은 World.executed(실행 순서, 얼린 객체)에서 꺼내 그대로 적는다: { tick, player, seq, type, ...내용 }.
 *   재생할 때 같은 tick·player·seq로 미리 모두 예약하고 끝 틱까지 돌린다 (실행 순서 = 틱 → 플레이어 → seq).
 * - 데이터(JSON 수치)가 바뀌면 같은 명령이라도 결과가 달라진다 → 파일에 dataHash를 적어 두고, 해시가 다르면
 *   "데이터가 바뀌었다"를 같이 알려 준다. 규칙·수치를 일부러 바꾼 커밋은 `npm run replays`로 다시 만들고 기록에 남긴다.
 * - 화면·DOM과 무관 (sim 안). 파일 읽기·쓰기는 부르는 쪽(테스트·도구·화면)이 한다.
 */
import type { GameData } from '../data/load';
import { validateCommand, type Command, type CommandInput } from './Commands';
import { fnv1a32 } from './hash';
import { createMatch, type Match, type MatchOptions } from './match';
import type { Deck } from './rules';
import type { MatchMode } from './state';

export const REPLAY_VERSION = 1;
/** 주기 해시 간격 기본값 (틱, 10초) */
export const DEFAULT_CHECKPOINT_TICKS = 200;

/** 리플레이 파일 (JSON). 모든 값은 정수·문자열·불리언. */
export interface ReplayFile {
  version: number;
  /** 이름 (파일 이름과 같게) */
  name: string;
  /** 설명 (사람이 읽는 용도) */
  note: string;
  seed: number;
  mode: MatchMode;
  /** 캠페인 테마 (무한 모드 0) */
  theme: number;
  players: number;
  debug: boolean;
  /** 플레이어별 덱 (판 시작 때 그대로) */
  decks: Deck[];
  /** 플레이어별 타워 레벨 (없는 타워 = 1) */
  levels: Record<string, number>[];
  /** 플레이어별 계정 레벨 (도박 테이블 해금, M5-5). 없으면 모두 1 (M5 전에 만든 리플레이) */
  accountLevels?: number[];
  /** 플레이어별 잠긴 히든 타워 id (G-3). 없으면 모두 열림 — 아무도 잠기지 않은 판은 이 필드를 적지 않는다 (예전 파일과 같은 모양) */
  lockedHidden?: string[][];
  /** 플레이어별 유물 (V3 P2). 아무도 유물이 없으면 적지 않는다 (예전 파일과 같은 모양) */
  relics?: Record<string, number>[];
  /** 데이터 지문 (fnv1a32, 키 정렬 JSON) — 다르면 수치가 바뀐 것 */
  dataHash: number;
  /** 끝 틱: 0틱부터 이 틱 수만큼 돌린다 */
  endTick: number;
  /** 실행된 명령 (실행 순서) */
  commands: Record<string, string | number>[];
  /** 주기 해시 [틱, 해시] — 그 틱까지 돌린 뒤(틱 번호 = match.tick)의 해시 */
  checkpoints: [number, number][];
  /** 끝 해시 */
  finalHash: number;
  /** 끝 상태 요약 (사람이 읽는 용도, 검증하지 않음) */
  summary: { stage: number; kills: number; gold: number; towers: number; defeated: boolean };
}

/** 키를 정렬한 JSON (객체 키 순서와 무관한 지문용). */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 데이터 지문: 판 결과에 영향을 주는 JSON 전부 (타워·몹·캠페인·맵·판 설정·곡선·덱). */
export function dataFingerprint(data: GameData): number {
  return fnv1a32(stableJson(data));
}

type InputKeys = 'seed' | 'mode' | 'theme' | 'players' | 'debug' | 'decks' | 'levels' | 'accountLevels' | 'lockedHidden' | 'relics';

/** 판 → 그 판을 다시 만드는 입력. */
export function matchInputs(match: Match): Pick<ReplayFile, InputKeys> {
  const { state, decks, levels, accountLevels, lockedHidden, relics } = match.ctx;
  const locked = lockedHidden.map((set) => [...set].sort());
  return {
    seed: match.world.seed,
    mode: state.mode,
    theme: state.theme,
    players: match.world.players,
    debug: state.debug,
    decks: decks.map((d) => ({ normal: [...d.normal], rare: [...d.rare], unique: [...d.unique], hero: [...d.hero], legend: [...d.legend] })),
    levels: levels.map((l) => ({ ...l })),
    accountLevels: [...accountLevels],
    ...(locked.some((l) => l.length > 0) ? { lockedHidden: locked } : {}),
    ...(relics.some((r) => Object.keys(r).length > 0) ? { relics: relics.map((r) => ({ ...r })) } : {}),
  };
}

/** 리플레이 입력 → createMatch 옵션. */
export function replayMatchOptions(file: Pick<ReplayFile, InputKeys>): MatchOptions {
  return {
    seed: file.seed,
    mode: file.mode,
    ...(file.mode === 'campaign' ? { theme: file.theme } : {}),
    players: file.players,
    debug: file.debug,
    decks: file.decks,
    levels: file.levels,
    ...(file.accountLevels ? { accountLevels: file.accountLevels } : {}),
    ...(file.lockedHidden ? { lockedHidden: file.lockedHidden } : {}),
    ...(file.relics ? { relics: file.relics } : {}),
  };
}

/** 명령 → 파일에 적는 평범한 객체. */
function commandRecord(c: Command): Record<string, string | number> {
  return { ...(c as unknown as Record<string, string | number>) };
}

/** 리플레이 파일 모양·명령 검사. 문제가 있으면 이유, 없으면 null. */
export function validateReplay(file: unknown): string | null {
  if (typeof file !== 'object' || file === null) return '리플레이가 객체가 아님';
  const f = file as Partial<ReplayFile>;
  if (f.version !== REPLAY_VERSION) return `리플레이 버전이 ${REPLAY_VERSION}이 아님: ${String(f.version)}`;
  for (const k of ['seed', 'endTick', 'finalHash', 'players', 'dataHash', 'theme'] as const) {
    if (!Number.isSafeInteger(f[k])) return `${k}가 정수가 아님`;
  }
  if (f.mode !== 'infinite' && f.mode !== 'campaign') return `mode가 이상함: ${String(f.mode)}`;
  if (!Array.isArray(f.decks) || f.decks.length !== f.players) return 'decks가 플레이어 수만큼 없음';
  if (!Array.isArray(f.levels) || f.levels.length !== f.players) return 'levels가 플레이어 수만큼 없음';
  if (f.accountLevels !== undefined) {
    if (!Array.isArray(f.accountLevels) || f.accountLevels.length !== f.players) return 'accountLevels가 플레이어 수만큼 없음';
    if (!f.accountLevels.every((v) => Number.isSafeInteger(v) && v >= 1)) return 'accountLevels에 1 이상 정수가 아닌 값';
  }
  if (f.lockedHidden !== undefined) {
    if (!Array.isArray(f.lockedHidden) || f.lockedHidden.length !== f.players) return 'lockedHidden이 플레이어 수만큼 없음';
    if (!f.lockedHidden.every((l) => Array.isArray(l) && l.every((id) => typeof id === 'string'))) return 'lockedHidden에 문자열 목록이 아닌 값';
  }
  if (!Array.isArray(f.commands)) return 'commands가 배열이 아님';
  if (!Array.isArray(f.checkpoints)) return 'checkpoints가 배열이 아님';
  let prev: { tick: number; player: number; seq: number } | null = null;
  for (let i = 0; i < f.commands.length; i++) {
    const c = f.commands[i];
    const err = validateCommand(c, f.players as number);
    if (err) return `commands[${i}]: ${err}`;
    const cc = c as unknown as Command;
    if (cc.tick >= (f.endTick as number)) return `commands[${i}]: 끝 틱(${f.endTick}) 뒤의 명령 (틱 ${cc.tick})`;
    if (prev && (cc.tick < prev.tick || (cc.tick === prev.tick && (cc.player < prev.player || (cc.player === prev.player && cc.seq <= prev.seq))))) {
      return `commands[${i}]: 실행 순서(틱 → 플레이어 → seq)가 아님`;
    }
    prev = cc;
  }
  for (const [i, cp] of f.checkpoints.entries()) {
    if (!Array.isArray(cp) || cp.length !== 2 || !cp.every((v) => Number.isSafeInteger(v))) return `checkpoints[${i}]가 [틱, 해시]가 아님`;
  }
  return null;
}

/** 재생 결과. */
export interface ReplayResult {
  match: Match;
  hash: number;
  /** 저장된 해시와 처음 어긋난 곳 (주기 해시 또는 끝 해시). 다 맞으면 null */
  mismatch: { tick: number; expected: number; actual: number } | null;
  /** 데이터 지문이 파일과 다른가 (수치가 바뀌었으면 어긋나는 것이 당연) */
  dataChanged: boolean;
}

/**
 * 리플레이 재생: 같은 입력으로 판을 만들고 모든 명령을 원래 틱·플레이어·seq로 예약한 뒤 끝 틱까지 돌린다.
 * 주기 해시를 지날 때마다 비교하고, 처음 어긋난 곳을 돌려준다 (그래도 끝까지 돌린다).
 * onStep은 틱마다 불린다 (사건을 모아 보는 분석·테스트용 — 상태를 바꾸면 안 된다).
 */
export function playReplay(data: GameData, file: ReplayFile, opts: { onStep?: (match: Match) => void } = {}): ReplayResult {
  const err = validateReplay(file);
  if (err) throw new Error(`리플레이 ${file.name ?? '?'}: ${err}`);
  // 예전 리플레이(칸 무더기 전 명령)도 그대로 재생 (V2 L2 — 일반 판은 예전 명령을 받지 않는다)
  const match = createMatch(data, { ...replayMatchOptions(file), legacyCommands: true });
  for (const c of file.commands) {
    const r = match.world.enqueue(c as unknown as CommandInput);
    if (!r.ok) throw new Error(`리플레이 ${file.name}: 명령을 예약할 수 없다 (${r.reason})`);
  }
  const checkpoints = new Map(file.checkpoints.map(([t, h]) => [t, h]));
  let mismatch: ReplayResult['mismatch'] = null;
  while (match.tick < file.endTick) {
    match.step();
    opts.onStep?.(match);
    const expected = checkpoints.get(match.tick);
    if (expected !== undefined && mismatch === null) {
      const actual = match.hash();
      if (actual !== expected) mismatch = { tick: match.tick, expected, actual };
    }
  }
  const hash = match.hash();
  if (mismatch === null && hash !== file.finalHash) mismatch = { tick: match.tick, expected: file.finalHash, actual: hash };
  return { match, hash, mismatch, dataChanged: dataFingerprint(data) !== file.dataHash };
}

/**
 * 지금 판 → 주기 해시 없는 리플레이 파일 (판을 다시 돌리지 않음 — 빠름). playReplay로 그대로 재생할 수 있다
 * (끝 해시 = 지금 해시로 비교). recordReplay의 초안이자 FB-1 피드백 '판 기록'.
 */
export function replaySnapshot(match: Match, info: { name: string; note?: string; dataHash: number }): ReplayFile {
  return {
    version: REPLAY_VERSION,
    name: info.name,
    note: info.note ?? '',
    ...matchInputs(match),
    dataHash: info.dataHash,
    endTick: match.tick,
    commands: match.world.executed.map(commandRecord),
    checkpoints: [],
    finalHash: match.hash(),
    summary: {
      stage: match.state.stage,
      kills: match.state.kills,
      gold: match.state.gold,
      towers: match.towers().length,
      defeated: match.defeated,
    },
  };
}

/**
 * 판 하나의 기록 → 리플레이 파일. 판을 처음부터 다시 돌려 주기 해시를 만들고, 끝 해시가 원래 판과 같은지 확인한다
 * (기록하는 것만으로 결정성 검사가 한 번 된다). 원래 판과 다르면 에러.
 */
export function recordReplay(data: GameData, match: Match, info: { name: string; note?: string; checkpointTicks?: number }): ReplayFile {
  const every = info.checkpointTicks ?? DEFAULT_CHECKPOINT_TICKS;
  const draft = replaySnapshot(match, { name: info.name, note: info.note, dataHash: dataFingerprint(data) });
  // 다시 돌리며 주기 해시를 모은다
  const again = createMatch(data, { ...replayMatchOptions(draft), legacyCommands: true });
  for (const c of draft.commands) {
    const r = again.world.enqueue(c as unknown as CommandInput);
    if (!r.ok) throw new Error(`리플레이 기록 ${info.name}: ${r.reason}`);
  }
  while (again.tick < draft.endTick) {
    again.step();
    if (again.tick % every === 0) draft.checkpoints.push([again.tick, again.hash()]);
  }
  const replayed = again.hash();
  if (replayed !== draft.finalHash) {
    throw new Error(`리플레이 기록 ${info.name}: 다시 돌린 끝 해시가 다르다 (${replayed} ≠ ${draft.finalHash}) — 결정성이 깨졌다`);
  }
  return draft;
}

/** 리플레이 파일 → 보기 좋은 JSON 텍스트 (명령·주기 해시는 한 줄에 하나). */
export function replayToJson(file: ReplayFile): string {
  const lines: string[] = ['{'];
  const entries = Object.entries(file);
  entries.forEach(([k, v], i) => {
    const comma = i < entries.length - 1 ? ',' : '';
    if ((k === 'commands' || k === 'checkpoints') && Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`  ${JSON.stringify(k)}: []${comma}`);
        return;
      }
      lines.push(`  ${JSON.stringify(k)}: [`);
      v.forEach((x, j) => lines.push(`    ${JSON.stringify(x)}${j < v.length - 1 ? ',' : ''}`));
      lines.push(`  ]${comma}`);
    } else {
      lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`);
    }
  });
  lines.push('}');
  return `${lines.join('\n')}\n`;
}
