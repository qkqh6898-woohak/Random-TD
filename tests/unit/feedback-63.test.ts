/**
 * 피드백 #63 — '레어 이하 자동 승급, 유니크 이하 자동 승급...' (autoMerge 명령 + 화면 설정 '자동 승급').
 * 이슈에 판 기록 JSON이 없어 리플레이 재현 대신 규칙 테스트 + 리플레이 왕복(결정성)으로 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { validatePayload } from '../../src/sim/Commands';
import { listTowers, type Tower } from '../../src/sim/entities/Tower';
import type { Match } from '../../src/sim/match';
import { placeTower } from '../../src/sim/systems/Summon';
import { autoMergeReady, fullStacks } from '../../src/sim/systems/Merge';
import { gradeRank } from '../../src/sim/rules';
import { playReplay, recordReplay, replayToJson } from '../../src/sim/replay';
import { AUTO_MERGE_STEPS, autoMergeRank, nextAutoMerge, parseSettings } from '../../src/meta/settings';
import { autoMergeLabel } from '../../src/ui/messages';
import { arena, arenaData, command, infinite } from '../helpers/match';

function stack(m: Match, id: string, x: number, y: number, n: number, owner = 0): Tower[] {
  const out: Tower[] = [];
  for (let i = 0; i < n; i++) out.push(placeTower(m.world, id, owner, x, y));
  return out;
}

function gradeOf(m: Match, t: string): string {
  return m.rules.towers.get(t)?.grade ?? '';
}

describe('피드백 #63 자동 승급 (autoMerge)', () => {
  it('명령 내용 검사: g = 1(노말)~4(히어로) 정수', () => {
    for (const g of [1, 2, 3, 4]) expect(validatePayload({ type: 'autoMerge', g })).toBeNull();
    expect(validatePayload({ type: 'autoMerge', g: 0 })).not.toBeNull();
    expect(validatePayload({ type: 'autoMerge', g: 5 })).not.toBeNull();
    expect(validatePayload({ type: 'autoMerge', g: 1.5 })).not.toBeNull();
    expect(validatePayload({ type: 'autoMerge' })).not.toBeNull();
    expect(validatePayload({ type: 'autoMerge', g: 2, x: 1 })).not.toBeNull();
  });

  it('레어 이하: 노말·레어 가득 찬 무더기만 승급하고, 유니크 무더기는 남긴다 (연쇄로 기준 위까지 올라가지 않음)', () => {
    const m = arena(63);
    const pads = m.map.buildable;
    stack(m, 'goblin', pads[0]![0], pads[0]![1], 3); // 노말
    stack(m, 'merchant', pads[1]![0], pads[1]![1], 3); // 레어
    stack(m, 'icemage', pads[2]![0], pads[2]![1], 3); // 유니크 — 그대로
    m.world.drainEvents();
    command(m, { type: 'autoMerge', g: 2 });
    const evs = m.world.drainEvents();
    const merges = evs.filter((e) => e.type === 'merge');
    expect(merges.length).toBeGreaterThanOrEqual(2);
    for (const e of merges) expect(gradeRank(gradeOf(m, String(e.fromTower)) as 'normal')).toBeLessThanOrEqual(2);
    expect(merges.some((e) => e.fromTower === 'icemage')).toBe(false);
    // 끝나면 레어 이하 가득 찬 무더기는 없고, 유니크 무더기는 남는다
    expect(autoMergeReady(m.ctx, m.world, 0, 2)).toBe(false);
    expect(fullStacks(m.ctx, m.world, 0).some((s) => s[0]!.tower === 'icemage')).toBe(true);
    expect(evs.find((e) => e.type === 'autoMerge')).toMatchObject({ player: 0, steps: merges.length });
    expect(evs.filter((e) => e.type === 'mergeChain' || e.type === 'mergeFail')).toHaveLength(0);
  });

  it('유니크 이하: 유니크 무더기까지 승급, 히어로 무더기는 남긴다', () => {
    const m = arena(64);
    const pads = m.map.buildable;
    stack(m, 'icemage', pads[0]![0], pads[0]![1], 3);
    stack(m, 'summoner', pads[1]![0], pads[1]![1], 3); // 히어로 — 그대로
    m.world.drainEvents();
    command(m, { type: 'autoMerge', g: 3 });
    const merges = m.world.drainEvents().filter((e) => e.type === 'merge');
    expect(merges.map((e) => e.fromTower)).toContain('icemage');
    expect(merges.some((e) => gradeOf(m, String(e.fromTower)) === 'hero')).toBe(false);
    expect(autoMergeReady(m.ctx, m.world, 0, 3)).toBe(false);
    expect(autoMergeReady(m.ctx, m.world, 0, 4)).toBe(true);
  });

  it('무더기가 많아도(연쇄 상한 merge.chainMax 넘게) 기준 이하는 끝까지 승급', () => {
    const m = arena(65);
    const pads = m.map.buildable;
    for (let i = 0; i < 15; i++) stack(m, 'goblin', pads[i]![0], pads[i]![1], 3);
    command(m, { type: 'autoMerge', g: 2 });
    const merges = m.world.drainEvents().filter((e) => e.type === 'merge');
    expect(merges.length).toBeGreaterThanOrEqual(15);
    expect(15).toBeGreaterThan(m.rules.mergeChainMax);
    expect(autoMergeReady(m.ctx, m.world, 0, 2)).toBe(false);
  });

  it('남의 무더기는 건드리지 않고, 승급할 것이 없으면 상태·사건 없음', () => {
    const m = arena(66, { players: 2 });
    const pads = m.map.buildable;
    stack(m, 'goblin', pads[0]![0], pads[0]![1], 3, 1);
    stack(m, 'goblin', pads[1]![0], pads[1]![1], 2); // 덜 참
    stack(m, 'merchant', pads[2]![0], pads[2]![1], 3); // 레어 — 노말 기준이면 그대로
    const towers = listTowers(m.world).length;
    m.world.drainEvents();
    expect(autoMergeReady(m.ctx, m.world, 0, 1)).toBe(false);
    command(m, { type: 'autoMerge', g: 1 });
    const evs = m.world.drainEvents();
    expect(evs.filter((e) => e.type === 'merge' || e.type === 'autoMerge' || e.type === 'mergeFail')).toHaveLength(0);
    expect(listTowers(m.world)).toHaveLength(towers);
    expect(fullStacks(m.ctx, m.world, 1)).toHaveLength(1);
  });

  it('리플레이 왕복 = 같은 해시 (명령만으로 만든 판)', () => {
    const m = infinite(63, { debug: true });
    command(m, { type: 'debugAddGold', amount: 500_000 });
    for (let i = 0; i < 18; i++) command(m, { type: 'summonAuto' });
    command(m, { type: 'autoMerge', g: 2 });
    expect(autoMergeReady(m.ctx, m.world, 0, 2)).toBe(false);
    m.stepN(100);
    const file = recordReplay(arenaData, m, { name: 'fb63-roundtrip' });
    const r = playReplay(arenaData, JSON.parse(replayToJson(file)));
    expect(r.mismatch).toBeNull();
    expect(r.hash).toBe(m.hash());
  });
});

describe('자동 승급 설정 (화면)', () => {
  it('기본 꺼짐 · 예전 저장값(키 없음)도 꺼짐 · 망가진 값은 꺼짐', () => {
    expect(parseSettings(null).autoMerge).toBe('off');
    expect(parseSettings('{"v":1,"tapMerge":false}').autoMerge).toBe('off');
    expect(parseSettings('{"autoMerge":"legend"}').autoMerge).toBe('off');
    expect(parseSettings('{"autoMerge":3}').autoMerge).toBe('off');
    expect(parseSettings('{"autoMerge":"unique"}').autoMerge).toBe('unique');
  });

  it('누를 때마다 꺼짐 → 노말 → 레어 이하 → 유니크 이하 → 히어로 이하 → 꺼짐', () => {
    expect(AUTO_MERGE_STEPS).toEqual(['off', 'normal', 'rare', 'unique', 'hero']);
    let v = parseSettings(null).autoMerge;
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      v = nextAutoMerge(v);
      seen.push(v);
    }
    expect(seen).toEqual(['normal', 'rare', 'unique', 'hero', 'off']);
  });

  it('설정 → 명령 등급 번호, 글자', () => {
    expect(autoMergeRank('off')).toBeNull();
    expect(autoMergeRank('normal')).toBe(1);
    expect(autoMergeRank('rare')).toBe(2);
    expect(autoMergeRank('unique')).toBe(3);
    expect(autoMergeRank('hero')).toBe(4);
    expect(autoMergeLabel('off')).toBe('꺼짐');
    expect(autoMergeLabel('normal')).toBe('노말');
    expect(autoMergeLabel('rare')).toBe('레어 이하');
    expect(autoMergeLabel('unique')).toBe('유니크 이하');
    expect(autoMergeLabel('hero')).toBe('히어로 이하');
  });
});
