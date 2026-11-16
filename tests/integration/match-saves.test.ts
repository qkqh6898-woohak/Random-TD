/**
 * A-1 자동 저장·이어 하기 (Codex 갈래 match-saves.test.ts를 우리 World·Storage에 맞춰 옮기고 늘림).
 * 핵심: 저장 → (JSON 글자) → 되살리기 → 같은 명령 → 끊기지 않은 판과 같은 해시. 저장한 리플레이 7개 모두 판 중간 두 곳에서 끊어 확인한다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MATCH_SLOT, MATCH_SLOT_DEV, MAX_SAVED_EXECUTED, MatchSaves, decodeSave, encodeSave, savedCheckpoint } from '../../src/save/MatchSaves';
import { BrowserStorage, MemoryStorage } from '../../src/save/storage';
import type { CommandInput } from '../../src/sim/Commands';
import { createMatch } from '../../src/sim/match';
import { matchInputs, recordReplay, replayMatchOptions, type ReplayFile } from '../../src/sim/replay';
import { OPTIONAL_STATE_KEYS } from '../../src/sim/state';
import { arenaData, command, data, infinite, summonAt } from '../helpers/match';

const DIR = join(__dirname, '..', 'replays');
const VERSION = '0.1.8-test';

function saves(d = arenaData, opts: { dev?: boolean; version?: string } = {}) {
  const storage = new MemoryStorage();
  const store = new MatchSaves(d, storage, { version: opts.version ?? VERSION, dev: opts.dev ?? false });
  return { store, storage };
}

describe('저장 → 되살리기', () => {
  it('전투 중 판(타워·일꾼·강화·대기 명령·난수·엔티티 번호)을 그대로 되살리고, 같은 명령이면 같은 해시', () => {
    const { store } = saves();
    const match = infinite(61);
    summonAt(match, 2, 2);
    summonAt(match, 3, 2);
    summonAt(match, 4, 2);
    command(match, { type: 'hireWorker' });
    command(match, { type: 'upgrade', k: 0 });
    command(match, { type: 'readyNow' });
    match.stepN(440);
    expect(match.state.stage).toBeGreaterThanOrEqual(1);
    expect(match.mobs().length).toBeGreaterThan(0);
    // 미래 틱에 예약한 명령 (대기 명령도 저장된다)
    expect(match.world.enqueue({ type: 'upgrade', k: 0, tick: match.tick + 3 }).ok).toBe(true);
    const token = store.write(match, 2, null, 'run-a');
    expect(token).not.toBeNull();

    const saved = store.read()!;
    expect(saved).not.toBeNull();
    expect(saved.token).toBe(token);
    expect(saved.speed).toBe(2);
    expect(saved.runId).toBe('run-a');
    expect(saved.dev).toBe(false);
    expect(saved.match.hash()).toBe(match.hash());
    expect(saved.match.tick).toBe(match.tick);
    expect(saved.match.world.executed).toEqual(match.world.executed);
    expect(saved.match.world.queue.pending()).toEqual(match.world.queue.pending());
    expect(saved.match.world.queue.peekNextSeq(0)).toBe(match.world.queue.peekNextSeq(0));
    expect(saved.match.world.entities.nextId).toBe(match.world.entities.nextId);

    for (const game of [match, saved.match]) {
      command(game, { type: 'summon', x: 5, y: 2 });
      game.stepN(380);
    }
    expect(saved.match.hash()).toBe(match.hash());
    expect(saved.match.state.upgrades[0]?.[0]).toBe(2);
    expect(saved.match.state.workers).toBe(1);
  });

  it('되살린 판을 이어서 기록해도 처음부터 다시 돌린 리플레이와 끝 해시가 같다 (실행 기록이 이어진다)', () => {
    const { store } = saves();
    const match = infinite(5);
    summonAt(match, 2, 2);
    match.stepN(300);
    store.write(match, 1, null, 'r');
    const resumed = store.read()!.match;
    summonAt(resumed, 3, 2);
    resumed.stepN(200);
    // recordReplay가 0틱부터 다시 돌려 끝 해시를 비교한다 (다르면 에러)
    const file = recordReplay(arenaData, resumed, { name: 'resume' });
    expect(file.finalHash).toBe(resumed.hash());
    expect(file.commands.length).toBe(2);
  });

  const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    it(`리플레이 ${f}: 판 중간 두 곳에서 저장·되살려 남은 명령을 돌리면 주기 해시·끝 해시가 같다`, () => {
      const file = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as ReplayFile;
      const checkpoints = new Map(file.checkpoints.map(([t, h]) => [t, h]));
      const cuts = [Math.floor(file.endTick / 3), Math.floor((file.endTick * 2) / 3)];
      let match = createMatch(data, replayMatchOptions(file));
      for (const c of file.commands) expect(match.world.enqueue(c as unknown as CommandInput).ok).toBe(true);
      const store = new MatchSaves(data, new MemoryStorage(), { version: VERSION, dev: file.debug });
      let token: string | null = null;
      let restoredCount = 0;
      while (match.tick < file.endTick) {
        if (cuts.includes(match.tick) && match.state.phase === 'playing') {
          const before = match.hash();
          token = store.write(match, 1, token, `replay-${f}`);
          expect(token).not.toBeNull();
          const restored = store.read();
          expect(restored, store.lastDiscard ?? '').not.toBeNull();
          match = restored!.match;
          expect(match.hash()).toBe(before);
          restoredCount++;
        }
        match.step();
        const expected = checkpoints.get(match.tick);
        if (expected !== undefined) expect(match.hash(), `${f} 틱 ${match.tick}`).toBe(expected);
      }
      expect(match.hash()).toBe(file.finalHash);
      expect(restoredCount).toBe(2);
    });
  }

  it('실행 기록이 상한을 넘으면 빼고 저장해도 되살린 판의 해시·이어 간 해시가 같다 (실행 기록은 해시 밖)', () => {
    expect(MAX_SAVED_EXECUTED).toBeGreaterThan(1000);
    const match = infinite(21);
    summonAt(match, 2, 2);
    summonAt(match, 3, 2);
    match.stepN(200);
    const cp = savedCheckpoint(match.world.checkpointView(), 1);
    expect(cp.executed).toEqual([]);
    expect(savedCheckpoint(match.world.checkpointView()).executed.length).toBe(2);
    const fresh = createMatch(arenaData, replayMatchOptions(matchInputs(match)));
    fresh.world.restoreCheckpoint(JSON.parse(JSON.stringify(cp)), OPTIONAL_STATE_KEYS);
    expect(fresh.hash()).toBe(match.hash());
    for (const g of [match, fresh]) {
      command(g, { type: 'summon', x: 4, y: 2 });
      g.stepN(300);
    }
    expect(fresh.hash()).toBe(match.hash());
  });

  it('기기 저장소에 못 쓰면(용량 초과) persistFailed — 이번 실행은 메모리 사본으로 이어 간다', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    const store = new MatchSaves(arenaData, new BrowserStorage(full), { version: VERSION, dev: false });
    expect(store.write(infinite(1), 1, null, 'q')).not.toBeNull();
    expect(store.persistFailed).toBe(true);
    expect(store.read()?.match.world.seed).toBe(1);
    const ok = new MatchSaves(arenaData, new BrowserStorage(new MemoryStorage()), { version: VERSION, dev: false });
    ok.write(infinite(2), 1, null, 'q');
    expect(ok.persistFailed).toBe(false);
  });

  it('처음엔 없는 판 상태 필드(chanceOv·sells)도 저장·되살린다', () => {
    const fresh = infinite(1);
    for (const k of OPTIONAL_STATE_KEYS) expect(Object.hasOwn(fresh.state, k)).toBe(false);
    const { store } = saves(arenaData, { dev: true });
    const match = infinite(9, { debug: true });
    summonAt(match, 2, 2);
    command(match, { type: 'sellTower', x: 2, y: 2 });
    command(match, { type: 'debugSetChance', key: 'critBonus', bp: 500 });
    expect(match.state.sells).toBe(1);
    expect(match.state.chanceOv).toBeDefined();
    store.write(match, 3, null, 'dev-run');
    const saved = store.read()!;
    expect(saved.dev).toBe(true);
    expect(saved.match.state.sells).toBe(1);
    expect(saved.match.state.chanceOv).toEqual(match.state.chanceOv);
    expect(saved.match.hash()).toBe(match.hash());
  });
});

describe('지문·슬롯·손상', () => {
  it('저장 글자: 머리 + 내용 해시가 맞아야 읽는다', () => {
    const raw = encodeSave({ a: 1 });
    expect(raw.startsWith('RTD1 ')).toBe(true);
    expect(decodeSave(raw)).toEqual({ a: 1 });
    expect(decodeSave(raw.replace('"a":1', '"a":2'))).toBeNull();
    expect(decodeSave('{"a":1}')).toBeNull();
  });

  it('손상된 저장·다른 데이터·다른 앱 버전·다른 형식은 버리고 슬롯을 지운다 (게임은 새 판으로)', () => {
    const { store, storage } = saves();
    store.write(infinite(13), 1, null, 'x');
    const raw = storage.getItem(MATCH_SLOT)!;
    storage.setItem(MATCH_SLOT, raw.replace('"seed":13', '"seed":99'));
    expect(store.read()).toBeNull();
    expect(store.lastDiscard).toBe('망가진 저장');
    expect(store.discardedByUpdate).toBe(false);
    expect(storage.getItem(MATCH_SLOT)).toBeNull();

    // 데이터가 바뀜 (수치 하나)
    store.write(infinite(13), 1, null, 'x');
    const changed = { ...arenaData, game: { ...arenaData.game, match: { ...arenaData.game.match, startGold: arenaData.game.match.startGold + 1 } } };
    const other = new MatchSaves(changed as typeof arenaData, storage, { version: VERSION, dev: false });
    expect(other.read()).toBeNull();
    expect(other.lastDiscard).toBe('게임 데이터가 바뀜');
    expect(other.discardedByUpdate).toBe(true);
    // 버린 뒤 다시 읽으면 저장이 없으니 알림도 없다 (타이틀에 한 번만)
    expect(other.read()).toBeNull();
    expect(other.discardedByUpdate).toBe(false);
    expect(storage.getItem(MATCH_SLOT)).toBeNull();

    // 앱 버전이 바뀜
    store.write(infinite(13), 1, null, 'x');
    const newer = new MatchSaves(arenaData, storage, { version: '9.9.9', dev: false });
    expect(newer.read()).toBeNull();
    expect(newer.lastDiscard).toContain('앱 버전');
    expect(newer.discardedByUpdate).toBe(true);

    // 형식이 다른 옛 저장 (Codex 갈래 v0.1.7 모양) — 머리가 없다
    storage.setItem(MATCH_SLOT, JSON.stringify({ version: 1, digest: 1, payload: '{}' }));
    expect(store.read()).toBeNull();
    expect(store.discardedByUpdate).toBe(false); // 머리가 없는 옛 저장은 '망가진 저장' (형식 표시를 못 읽음)
  });

  it('개발자 판은 개발자 슬롯에만 (일반 저장을 덮지 않음, 서로 안 보임)', () => {
    const storage = new MemoryStorage();
    const normal = new MatchSaves(arenaData, storage, { version: VERSION, dev: false });
    const dev = new MatchSaves(arenaData, storage, { version: VERSION, dev: true });
    expect(normal.write(infinite(1), 1, null, 'n')).not.toBeNull();
    // 일반 저장소에 개발자 판은 쓰지 않는다 (반대도)
    expect(normal.write(infinite(2, { debug: true }), 1, null, 'd')).toBeNull();
    expect(dev.write(infinite(3), 1, null, 'n2')).toBeNull();
    expect(dev.write(infinite(4, { debug: true }), 1, null, 'd')).not.toBeNull();
    expect(storage.getItem(MATCH_SLOT)).not.toBeNull();
    expect(storage.getItem(MATCH_SLOT_DEV)).not.toBeNull();
    expect(normal.read()?.match.world.seed).toBe(1);
    expect(dev.read()?.match.world.seed).toBe(4);
    expect(dev.read()?.match.state.debug).toBe(true);
  });

  it('오래된 창은 다른 창이 바꾼 슬롯을 덮어쓰거나 지우지 않는다', () => {
    const { store } = saves();
    const first = store.write(infinite(11), 1, null, 'a')!;
    const second = store.write(infinite(12), 1, null, 'b')!;
    expect(store.write(infinite(11), 1, first, 'a')).toBeNull();
    store.clear(first);
    expect(store.read()?.match.world.seed).toBe(12);
    store.clear(second);
    expect(store.read()).toBeNull();
  });

  it('끝난 판(패배)은 저장하지 않는다', () => {
    const { store } = saves();
    const match = infinite(1);
    match.state.phase = 'defeat';
    expect(store.write(match, 1, null, 'x')).toBeNull();
  });
});
