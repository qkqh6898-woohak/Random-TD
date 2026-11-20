/**
 * 진행 중인 판 자동 저장·이어 하기 (A-1, Codex 갈래 M6-5에서 옮김 — 우리 World·Storage에 맞춰 다시 씀).
 *
 * - 기기에 판 하나만 둔다: 일반 판 슬롯 `rtd.match`, 개발자 모드 판(?dev=1·?debug=1·테스트 빌드) 슬롯 `rtd.match.dev`.
 *   개발자 판은 저장은 하되 따로 두고 `dev: true`로 표시한다 (sim의 debug 판 표시와 같은 값) — 일반 타이틀에는 보이지 않고,
 *   개발자 판이 일반 판 저장을 덮어쓰지도 않는다.
 * - 내용: 판 시작 입력(리플레이와 같은 matchInputs) + World 체크포인트(틱·난수·엔티티·다음 ID·대기 명령·다음 명령 번호·실행 기록·판 상태)
 *   + 화면 값(배속, 판 식별자). sim 상태를 그대로 담으므로 강화·도박·도전·미션·카드·일꾼·준비 완료 등 판 상태 전부가 돌아온다.
 * - 지문: 데이터 지문(dataFingerprint) + sim 규칙 버전(SIM_VERSION, src/sim/version.ts) + 저장 형식 번호. 하나라도 다르면 저장을 버린다
 *   (슬롯을 지움) — 데이터·규칙이 바뀐 뒤 옛 상태를 이어 붙이면 판이 어긋나므로. 앱 버전은 적어만 둔다(V2 M2b: 화면만 바꾼 릴리스는 이어 하기 유지).
 *   망가진 글자(내용 해시 불일치)·모양이 다른 상태도 같이 버린다.
 * - 업데이트(형식·규칙·데이터)나 되살리기 실패로 버릴 때는 **먼저 정산**한다 (V2 M2a): 저장 JSON에서 판 결과(시드·단계·보스 처치·소환·승급·
 *   판 식별자 …)를 꺼내 `onAbandoned`에 넘긴다 — 부르는 쪽(main.ts)이 계정 보상(progress.settle, runId로 한 번만)·전투 기록을 남긴다.
 * - 저장 글자: `RTD1 <내용 해시 8자리>\n<JSON>`. 읽은 글자 전체를 '토큰'으로 들고 있다가, 쓸 때 슬롯이 그 토큰과 다르면
 *   (다른 창이 새 판을 시작함) 덮어쓰지 않는다.
 * - 저장소는 KeyValueStorage(src/save/storage.ts) 뒤에서만 쓴다. 실패해도 게임을 막지 않는다 (null).
 */
import type { GameData } from '../data/load';
import { fnv1a32, hashHex } from '../sim/hash';
import { createMatch, type Match } from '../sim/match';
import { dataFingerprint, matchInputs, replayMatchOptions } from '../sim/replay';
import { OPTIONAL_STATE_KEYS } from '../sim/state';
import type { WorldCheckpoint } from '../sim/World';
import { SIM_VERSION } from '../sim/version';
import type { KeyValueStorage } from './storage';

export const MATCH_SLOT = 'rtd.match';
export const MATCH_SLOT_DEV = 'rtd.match.dev';
/** 저장 형식 번호 (모양을 바꾸면 올린다 → 옛 저장은 버려진다) */
export const MATCH_SAVE_FORMAT = 1;
const HEADER = 'RTD1 ';
/** 되살리기 실패 이유의 머리 (이 이유로 버리는 판도 정산한다 — 규칙이 바뀌었는데 SIM_VERSION을 안 올린 경우의 그물) */
const RESTORE_FAILED = '되살리기 실패';

type Inputs = ReturnType<typeof matchInputs>;

interface SavePayload {
  format: number;
  /** 앱 버전 (package.json) — 적어만 둔다 (지문 아님, V2 M2b) */
  app: string;
  /** sim 규칙 버전 (SIM_VERSION) — 다르면 이어 할 수 없다 */
  sim: number;
  /** 데이터 지문 */
  dataHash: number;
  /** 개발자 모드 판 (= inputs.debug = state.debug) */
  dev: boolean;
  /** 화면 배속 (일시정지 중이면 계속하면 돌아갈 배속) */
  speed: number;
  /** 판 식별자 (전투 기록이 이어 한 판을 한 번만 세게) */
  runId: string;
  inputs: Inputs;
  world: WorldCheckpoint;
}

export interface SavedMatch {
  match: Match;
  speed: number;
  runId: string;
  dev: boolean;
  /** 읽은 저장 글자 그대로 (다른 창이 바꾼 슬롯을 덮어쓰거나 지우지 않기 위한 값) */
  token: string;
}

/**
 * 업데이트·되살리기 실패로 버린 진행 중 판의 결과 (저장 JSON에서 꺼냄, V2 M2a). 판을 되살리지 않고 읽는다 — 정산(MatchResult)과
 * 전투 기록에 필요한 값만. 값이 모자라거나 이상하면 만들지 않는다 (정산 없이 버림).
 */
export interface AbandonedRun {
  runId: string;
  seed: number;
  mode: 'infinite' | 'campaign';
  theme: number;
  players: number;
  /** 도달 단계 */
  stage: number;
  bossesKilled: number;
  summons: number;
  merges: number;
  /** 최고 도전 단계 */
  challengeBest: number;
  /** 저장한 틱 (게임 시간) */
  tick: number;
  /** 개발자 판·치트 판 (state.debug || state.debugUsed) */
  dev: boolean;
  /** 버린 이유 */
  reason: string;
}

export interface MatchSavesOptions {
  /** 앱 버전 (저장에 적어만 둔다 — 지문 아님) */
  version: string;
  /** 개발자 모드 (슬롯을 고른다) */
  dev: boolean;
  /** sim 규칙 버전 (생략하면 SIM_VERSION — 테스트가 바꿔 본다) */
  simVersion?: number;
  /**
   * 버리기 직전 정산 훅 (V2 M2a): 업데이트(형식·규칙·데이터)나 되살리기 실패로 진행 중 판을 버릴 때 한 번. 보상을 줬으면 true.
   * 예외는 삼킨다 (정산이 실패해도 저장은 버린다 — 다음 실행마다 다시 시도해 막히지 않게). 중복은 받는 쪽이 runId로 거른다.
   */
  onAbandoned?: (run: AbandonedRun) => boolean | void;
}

function int(v: unknown): v is number {
  return Number.isSafeInteger(v) && (v as number) >= 0;
}

/** 저장 내용 → 버린 판의 결과 (순수, 값이 이상하면 null). 형식이 달라도 같은 이름의 값이 있으면 읽는다. */
export function abandonedRunOf(payload: unknown, reason: string): AbandonedRun | null {
  const p = payload as { runId?: unknown; inputs?: { seed?: unknown; players?: unknown }; world?: { tick?: unknown; seed?: unknown; players?: unknown; state?: Record<string, unknown> } } | null;
  if (!p || typeof p !== 'object' || !p.world || typeof p.world !== 'object') return null;
  const st = p.world.state;
  if (!st || typeof st !== 'object') return null;
  const runId = p.runId;
  if (typeof runId !== 'string' || runId.length === 0 || runId.length > 64) return null;
  const seed = Number.isSafeInteger(p.inputs?.seed) ? p.inputs?.seed : p.world.seed;
  const players = Number.isSafeInteger(p.inputs?.players) ? p.inputs?.players : p.world.players;
  const mode = st.mode;
  if (!Number.isSafeInteger(seed) || !int(players) || (mode !== 'infinite' && mode !== 'campaign')) return null;
  if (st.phase !== undefined && st.phase !== 'playing') return null;
  const nums = [st.stage, st.bossesKilled, st.summons, st.merges, p.world.tick];
  if (!nums.every(int)) return null;
  return {
    runId,
    seed: seed as number,
    mode,
    theme: int(st.theme) ? st.theme : 0,
    players: players as number,
    stage: st.stage as number,
    bossesKilled: st.bossesKilled as number,
    summons: st.summons as number,
    merges: st.merges as number,
    challengeBest: int(st.challengeBest) ? st.challengeBest : 0,
    tick: p.world.tick as number,
    dev: st.debug === true || st.debugUsed === true,
    reason,
  };
}

/** 저장 글자 만들기 (순수). */
export function encodeSave(payload: object): string {
  const json = JSON.stringify(payload);
  return `${HEADER}${hashHex(fnv1a32(json))}\n${json}`;
}

/** 저장 글자 풀기: 머리·내용 해시가 맞으면 객체, 아니면 null (순수). */
export function decodeSave(raw: string): unknown {
  if (!raw.startsWith(HEADER)) return null;
  const nl = raw.indexOf('\n');
  if (nl !== HEADER.length + 8) return null;
  const digest = raw.slice(HEADER.length, nl);
  const json = raw.slice(nl + 1);
  if (hashHex(fnv1a32(json)) !== digest) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

/**
 * 저장에 담는 실행 기록 상한 (A-1b 검토). 이어 하기·해시에는 실행 기록이 필요 없다(해시 밖) — 되살린 판을 0틱부터 다시 돌리는
 * 리플레이 기록(개발 도구)에만 쓴다. 긴 판에서 저장 글자가 커지지 않게, 이 수를 넘으면 실행 기록을 통째로 빼고 저장한다
 * (일부만 남기면 리플레이가 틀린 판을 재현하므로). 보통 판(수백 개)은 그대로 담는다.
 */
export const MAX_SAVED_EXECUTED = 4000;

/** 저장할 체크포인트: 실행 기록이 상한을 넘으면 비운다 (순수). */
export function savedCheckpoint(cp: WorldCheckpoint, max = MAX_SAVED_EXECUTED): WorldCheckpoint {
  return cp.executed.length > max ? { ...cp, executed: [] } : cp;
}

export class MatchSaves {
  private fingerprint: number | null = null;
  readonly slot: string;
  /** 마지막으로 저장을 버린 이유 (확인·테스트용, 없으면 null) */
  lastDiscard: string | null = null;

  /** 마지막 read()가 업데이트(저장 형식·sim 규칙 버전·게임 데이터 변경) 때문에 진행 중 판을 버렸는가 → 타이틀 알림 */
  discardedByUpdate = false;
  /** 마지막 read()가 버리면서 정산한 판 (보상을 줬으면 credited — 타이틀 알림 문구) */
  lastAbandoned: { run: AbandonedRun; credited: boolean } | null = null;
  /** 이번 실행에서 정산 훅에 넘긴 판 (슬롯을 못 지워 다시 읽어도 두 번 넘기지 않게) */
  private readonly abandonedRuns = new Set<string>();
  /** 마지막 write가 기기 저장소에 못 써짐 (용량 초과 등 — 이번 실행 동안 메모리 사본만, A-1b) */
  persistFailed = false;

  constructor(
    private readonly data: GameData,
    private readonly storage: KeyValueStorage,
    private readonly opts: MatchSavesOptions,
  ) {
    this.slot = opts.dev ? MATCH_SLOT_DEV : MATCH_SLOT;
  }

  /** 데이터 지문 (처음 쓸 때 한 번 계산, 약 15ms) */
  private dataHash(): number {
    this.fingerprint ??= dataFingerprint(this.data);
    return this.fingerprint;
  }

  /** 저장된 판이 있으면 되살려 돌려준다. 없거나 맞지 않으면 null (맞지 않는 저장은 지운다). */
  read(): SavedMatch | null {
    // 이번 읽기에서 버린 이유만 남긴다 (타이틀에 한 번만 알리게 — 버린 뒤 다시 읽으면 null)
    this.lastDiscard = null;
    this.discardedByUpdate = false;
    this.lastAbandoned = null;
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.slot);
    } catch {
      return null;
    }
    if (raw === null) return null;
    const reason = this.check(raw);
    if (typeof reason === 'string') {
      // 업데이트·되살리기 실패로 버리는 판은 먼저 정산 (V2 M2a). 망가진 저장·슬롯 표시 불일치 등은 정산하지 않는다
      if (this.discardedByUpdate || reason.startsWith(RESTORE_FAILED)) this.settleAbandoned(raw, reason);
      this.discard(raw, reason);
      return null;
    }
    return reason;
  }

  private settleAbandoned(raw: string, reason: string): void {
    const run = abandonedRunOf(decodeSave(raw), reason);
    if (!run || !this.opts.onAbandoned || this.abandonedRuns.has(run.runId)) return;
    this.abandonedRuns.add(run.runId);
    let credited = false;
    try {
      credited = this.opts.onAbandoned(run) === true;
    } catch {
      credited = false;
    }
    this.lastAbandoned = { run, credited };
  }

  private check(raw: string): SavedMatch | string {
    const p = decodeSave(raw) as Partial<SavePayload> | null;
    if (!p || typeof p !== 'object') return '망가진 저장';
    // 업데이트 때문에 맞지 않는 저장 (형식·앱 버전·데이터) → 타이틀에 한 번 알림 (문구가 아니라 이 표시로 판단)
    if (p.format !== MATCH_SAVE_FORMAT) return this.updateMismatch(`저장 형식이 다름 (${String(p.format)})`);
    // 앱 버전은 보지 않는다 (V2 M2b) — 화면만 바뀐 릴리스는 이어 할 수 있다. sim 규칙 버전이 다르면(또는 예전 저장이라 없으면) 버린다
    if (p.sim !== (this.opts.simVersion ?? SIM_VERSION)) return this.updateMismatch(`게임 규칙 버전이 다름 (${String(p.sim)})`);
    if (p.dataHash !== this.dataHash()) return this.updateMismatch('게임 데이터가 바뀜');
    if (p.dev !== this.opts.dev || !p.inputs || p.inputs.debug !== p.dev) return '개발자 판 표시가 슬롯과 다름';
    if (!Number.isSafeInteger(p.speed) || (p.speed as number) < 1) return '배속이 잘못됨';
    if (typeof p.runId !== 'string' || p.runId.length === 0 || p.runId.length > 64) return '판 식별자가 잘못됨';
    if (p.inputs.players !== 1 || !p.world) return '1인 판이 아님';
    try {
      const match = createMatch(this.data, replayMatchOptions(p.inputs));
      match.world.restoreCheckpoint(p.world, OPTIONAL_STATE_KEYS);
      if (match.state.phase !== 'playing') return '끝난 판';
      if (match.state.debug !== p.dev) return '개발자 판 표시가 상태와 다름';
      return { match, speed: p.speed as number, runId: p.runId, dev: p.dev, token: raw };
    } catch (e) {
      return `${RESTORE_FAILED}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  private updateMismatch(reason: string): string {
    this.discardedByUpdate = true;
    return reason;
  }

  private discard(raw: string, reason: string): void {
    this.lastDiscard = reason;
    try {
      if (this.storage.getItem(this.slot) === raw) this.storage.removeItem(this.slot);
    } catch {
      // 지우지 못해도 다음에 다시 버린다
    }
  }

  /**
   * 지금 판 저장 (틱 경계에서). previous = 이 판이 마지막으로 쓰거나 읽은 토큰 (새 판이면 null).
   * 슬롯이 previous와 다르면(다른 창이 바꿈) 쓰지 않는다. 쓴 토큰, 쓰지 않았으면 null.
   */
  write(match: Match, speed: number, previous: string | null, runId: string): string | null {
    if (match.state.phase !== 'playing' || match.world.players !== 1 || match.state.debug !== this.opts.dev) return null;
    try {
      if (previous !== null && this.storage.getItem(this.slot) !== previous) return null;
      const payload: SavePayload = {
        format: MATCH_SAVE_FORMAT,
        app: this.opts.version,
        sim: this.opts.simVersion ?? SIM_VERSION,
        dataHash: this.dataHash(),
        dev: this.opts.dev,
        speed,
        runId,
        inputs: matchInputs(match),
        world: savedCheckpoint(match.world.checkpointView()),
      };
      const token = encodeSave(payload);
      this.storage.setItem(this.slot, token);
      this.persistFailed = this.storage.lastWriteFailed === true;
      return token;
    } catch {
      this.persistFailed = true;
      return null;
    }
  }

  /** 판이 끝나면 지운다 (슬롯이 이 토큰일 때만 — 다른 창의 새 판은 그대로). */
  clear(token: string): void {
    try {
      if (this.storage.getItem(this.slot) === token) this.storage.removeItem(this.slot);
    } catch {
      // 지우지 못해도 결과 화면은 보인다
    }
  }
}
