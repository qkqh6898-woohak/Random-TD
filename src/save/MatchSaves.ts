import type { GameData } from '../data/load';
import { fnv1a32 } from '../sim/hash';
import { createMatch, type Match } from '../sim/match';
import { dataFingerprint, matchInputs, replayMatchOptions } from '../sim/replay';
import type { WorldCheckpoint } from '../sim/World';

const SLOT = 'random-td.active-match';
const SAVE_VERSION = 1;

type MatchStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface SavePayload {
  dataHash: number;
  speed: number;
  runId?: string;
  inputs: ReturnType<typeof matchInputs>;
  world: WorldCheckpoint;
}

export interface SavedMatch {
  match: Match;
  speed: number;
  runId: string;
  /** 이 판을 읽은 뒤 다른 창에서 바꾼 슬롯을 덮어쓰거나 지우지 않기 위한 값. */
  token: string;
}

/** 기기 내 진행 중인 판 하나. 저장소 제한이나 손상은 새 게임 진입을 막지 않는다. */
export class MatchSaves {
  private readonly dataHash: number;

  constructor(private readonly data: GameData, private readonly storage: () => MatchStorage) {
    this.dataHash = dataFingerprint(data);
  }

  read(): SavedMatch | null {
    try {
      const token = this.storage().getItem(SLOT);
      if (token === null) return null;
      const record = JSON.parse(token) as { version?: number; digest?: number; payload?: string } | null;
      if (record?.version !== SAVE_VERSION || typeof record.payload !== 'string' || fnv1a32(record.payload) !== record.digest) return null;
      const saved = JSON.parse(record.payload) as SavePayload;
      if (saved.dataHash !== this.dataHash || saved.inputs.players !== 1 || saved.inputs.debug ||
          !Number.isSafeInteger(saved.speed) || saved.speed < 1) return null;
      const match = createMatch(this.data, replayMatchOptions(saved.inputs));
      match.world.restoreCheckpoint(saved.world);
      if (match.state.phase !== 'playing' || match.state.debug) return null;
      const runId = typeof saved.runId === 'string' && saved.runId.length > 0 ? saved.runId : `legacy-${record.digest}`;
      return { match, speed: saved.speed, runId, token };
    } catch {
      return null;
    }
  }

  write(match: Match, speed: number, previous: string | null, runId?: string): string | null {
    if (match.state.phase !== 'playing' || match.state.debug || match.world.players !== 1) return null;
    try {
      const storage = this.storage();
      if (previous !== null && storage.getItem(SLOT) !== previous) return null;
      const payload = JSON.stringify({ dataHash: this.dataHash, speed, runId, inputs: matchInputs(match), world: match.world.checkpointView() } satisfies SavePayload);
      const token = JSON.stringify({ version: SAVE_VERSION, digest: fnv1a32(payload), payload });
      storage.setItem(SLOT, token);
      return token;
    } catch {
      return null;
    }
  }

  clear(token: string): void {
    try {
      const storage = this.storage();
      if (storage.getItem(SLOT) === token) storage.removeItem(SLOT);
    } catch {
      // 저장소가 잠겨도 패배 화면은 표시한다.
    }
  }
}
